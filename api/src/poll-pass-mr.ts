import { PIPELINE } from './pipeline/staged.ts';
import { failureKind, needsDoctor } from './failure-kind.ts';
import { log, logError } from './log.ts';
import { logger } from './logger.ts';
import { recordBelow } from './poll-plan.ts';
import { branchStateKey } from './own-branches-plan.ts';
import { heldReason } from './budget.ts';

// The work on one MR inside a pass (see poll-pass.ts). Review and triage share one skeleton:
// mark the MR busy, run, record what was done, notify; on a failure, say why and try again next
// poll. What differs is this table.
const reviewRecord = (state: any, mr: any, { plan }: any) => {
  state[mr.iid] = mr.sha;
  recordBelow(state, mr, plan.parentOf(mr));
};

// `entry` is the kind of the MR's status entry: my own MR can have two (own review, triage).
const KINDS: Record<string, any> = {
  review: {
    entry: 'review',
    label: 'Review',
    ready: 'Review ready',
    path: (deps: any, mr: any) => deps.reviewPath(mr),
    run: (deps: any, mr: any, { plan }: any) => {
      const info = plan.stackInfo(mr);
      return deps.runReview(mr, deps.reviewPath(mr), info && { stacks: plan.stacks, info });
    },
    record: reviewRecord,
  },
  own: {
    entry: 'own',
    label: 'Own review',
    ready: 'Own review ready',
    path: (deps: any, mr: any) => deps.ownPath(mr),
    run: (deps: any, mr: any, { plan }: any) => {
      const info = plan.stackInfo(mr);
      return deps.runReview(mr, deps.ownPath(mr), info && { stacks: plan.stacks, info }, { own: true });
    },
    record: reviewRecord,
  },
  // My branch without an MR yet: same file as its own review once the MR exists.
  branch: {
    entry: 'own',
    label: 'Own review',
    ready: 'Own review ready',
    path: (deps: any, mr: any) => deps.ownPath(mr),
    run: (deps: any, mr: any) => deps.runReview(mr, deps.ownPath(mr), null, { own: true }),
    record: (state: any, mr: any) => {
      state[branchStateKey(mr.source_branch)] = mr.sha;
    },
  },
  triage: {
    entry: 'comments',
    label: 'Comment triage',
    ready: 'Comments triaged',
    path: (deps: any, mr: any) => deps.commentsPath(mr),
    run: (deps: any, mr: any) => deps.runMrComments(mr),
    record: (state: any, mr: any, { signal }: any) => {
      state.mineComments[mr.iid] = signal;
    },
  },
};

// A failure that passes by itself (GitLab unreachable, Claude overloaded) brings the next poll
// closer and raises no alarm; any other one is notified and handed to the doctor, which explains it
// in the studio.
async function failed(mr: any, { label, entry }: any, err: any, { deps, sink, outcome }: any) {
  const failure = failureKind(err.message);
  await sink.setMr(mr, { status: 'failed', error: err.message, failure }, entry);
  if (failure.transient) outcome.retrySoon = true;
  else deps.notify(`${label} failed: ${failure.title}`, `!${mr.iid} ${mr.title}`);
  // The doctor a failure starts by itself is automatic work: it waits too once the budget is spent.
  if (needsDoctor(failure) && err.run && !readBudget(deps)?.over) {
    void deps.startDoctor({ project: mr.project, fileSlug: err.run.fileSlug, runId: err.run.id, auto: true })
      .catch((e: any) => logger.warn({ err: e }, 'Could not start the doctor'));
  }
}

// A budget that cannot be read holds nothing back: the limit protects spend, never blocks the line.
const readBudget = (deps: any) => {
  try {
    return deps.budget?.() ?? null;
  } catch (err) {
    logger.warn({ err }, 'Could not read today\'s budget');
    return null;
  }
};

// The MR a person asked to review again (a rerun task's target), which the budget never holds back.
export const askedFor = (asked: any, entry: string, mr: any) => Boolean(asked) && asked.kind === entry
  && (asked.iid !== null ? String(asked.iid) === String(mr.iid) : asked.sourceBranch === mr.source_branch);

// `ctx` is what the kind needs of the pass: { plan } for a review, { signal } for a triage.
// `pass` is { deps, sink, state, outcome, asked, held }. Once the day's budget is spent, automatic
// work waits: not recorded in the state, so the first poll after midnight takes it.
export async function workOnMr(kind: string, mr: any, ctx: any, pass: any) {
  const { deps, sink, state } = pass;
  const spec = KINDS[kind];
  const budget = askedFor(pass.asked, spec.entry, mr) ? null : readBudget(deps);
  if (budget?.over) {
    pass.held = (pass.held ?? 0) + 1;
    await sink.setMr(mr, { status: 'skipped', error: heldReason(budget), held: 'budget' }, spec.entry);
    return;
  }
  await sink.begin(mr, spec.entry);
  try {
    const outcome = await spec.run(deps, mr, ctx);
    if (outcome !== 'reviewed') {
      // Not recorded in state on a skip: the next poll retries it, once the branch has
      // been switched away from in the other worktree.
      await sink.setMr(mr, { status: 'skipped', error: `Branch "${mr.source_branch}" is checked out in another worktree.` }, spec.entry);
      return;
    }
    spec.record(state, mr, ctx);
    await deps.saveState(mr.project, state);
    await sink.setMr(mr, { status: 'up_to_date', reviewedAt: new Date().toISOString() }, spec.entry);
    deps.notify(spec.ready, mr.iid === null ? mr.title : `!${mr.iid} ${mr.title}`, spec.path(deps, mr));
  } catch (err) {
    logError(mr, `${spec.label} failed`, err);
    deps.trackFailure({ mr, kind, command: PIPELINE, error: err });
    await failed(mr, spec, err, pass);
  } finally {
    await sink.end(mr);
  }
}

// First time the bot ever sees this MR: if a review file already sits there (written by hand via
// /code-review, or by a previous run of this bot before the state existed) and is newer than the
// last push, trust it and don't redo the work. A file older than the last push predates some
// commits, so it falls through to a real review. True when it was trusted.
export async function trustExistingReview(mr: any, plan: any, { deps, sink, state }: any) {
  if (state[mr.iid] !== undefined || !(await deps.reviewFileCoversLastPush(mr))) return false;
  log(mr, `A review file newer than the last push already exists at ${deps.reviewPath(mr)}, assuming it covers this commit. Skipping.`);
  state[mr.iid] = mr.sha;
  recordBelow(state, mr, plan.parentOf(mr));
  await deps.saveState(mr.project, state);
  await sink.setMr(mr, { status: 'up_to_date' }, 'review');
  return true;
}
