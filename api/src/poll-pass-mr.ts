import { failureKind, needsDoctor } from './failure-kind.ts';
import { log, logError } from './log.ts';
import { logger } from './logger.ts';
import { recordBelow } from './poll-plan.ts';

// The work on one MR inside a pass (see poll-pass.ts). Review and triage share one skeleton:
// mark the MR busy, run, record what was done, notify; on a failure, say why and try again next
// poll. What differs is this table.
const KINDS = {
  review: {
    label: 'Review',
    ready: 'Review ready',
    command: (mr) => mr.project.reviewCommand,
    path: (deps, mr) => deps.reviewPath(mr),
    run: (deps, mr, { plan }) => {
      const info = plan.stackInfo(mr);
      return deps.runReview(mr, deps.reviewPath(mr), info && { stacks: plan.stacks, info });
    },
    record: (state, mr, { plan }) => {
      state[mr.iid] = mr.sha;
      recordBelow(state, mr, plan.parentOf(mr));
    },
  },
  triage: {
    label: 'Comment triage',
    ready: 'Comments triaged',
    command: (mr) => mr.project.triageCommand,
    path: (deps, mr) => deps.commentsPath(mr),
    run: (deps, mr) => deps.runMrComments(mr),
    record: (state, mr, { signal }) => {
      state.mineComments[mr.iid] = signal;
    },
  },
};

// A failure that passes by itself (GitLab unreachable, Claude overloaded) brings the next poll
// closer and raises no alarm; any other one is notified and handed to the doctor, which explains it
// in the studio.
async function failed(mr, label, err, { deps, sink, outcome }) {
  const failure = failureKind(err.message);
  await sink.setMr(mr, { status: 'failed', error: err.message, failure });
  if (failure.transient) outcome.retrySoon = true;
  else deps.notify(`${label} failed: ${failure.title}`, `!${mr.iid} ${mr.title}`);
  if (needsDoctor(failure) && err.run) {
    void deps.startDoctor({ project: mr.project, fileSlug: err.run.fileSlug, runId: err.run.id, auto: true })
      .catch((e) => logger.warn({ err: e }, 'Could not start the doctor'));
  }
}

// `ctx` is what the kind needs of the pass: { plan } for a review, { signal } for a triage.
// `pass` is { deps, sink, state, outcome }.
export async function workOnMr(kind, mr, ctx, pass) {
  const { deps, sink, state } = pass;
  const spec = KINDS[kind];
  await sink.begin(mr);
  try {
    const outcome = await spec.run(deps, mr, ctx);
    if (outcome !== 'reviewed') {
      // Not recorded in state on a skip: the next poll retries it, once the branch has
      // been switched away from in the other worktree.
      await sink.setMr(mr, { status: 'skipped', error: `Branch "${mr.source_branch}" is checked out in another worktree.` });
      return;
    }
    spec.record(state, mr, ctx);
    await deps.saveState(mr.project, state);
    await sink.setMr(mr, { status: 'up_to_date', reviewedAt: new Date().toISOString() });
    deps.notify(spec.ready, `!${mr.iid} ${mr.title}`, spec.path(deps, mr));
  } catch (err) {
    logError(mr, `${spec.label} failed`, err);
    deps.trackFailure({ mr, kind, command: spec.command(mr), error: err });
    await failed(mr, spec.label, err, pass);
  } finally {
    await sink.end();
  }
}

// First time the bot ever sees this MR: if a review file already sits there (written by hand via
// /code-review, or by a previous run of this bot before the state existed) and is newer than the
// last push, trust it and don't redo the work. A file older than the last push predates some
// commits, so it falls through to a real review. True when it was trusted.
export async function trustExistingReview(mr, plan, { deps, sink, state }) {
  if (state[mr.iid] !== undefined || !(await deps.reviewFileCoversLastPush(mr))) return false;
  log(mr, `A review file newer than the last push already exists at ${deps.reviewPath(mr)}, assuming it covers this commit. Skipping.`);
  state[mr.iid] = mr.sha;
  recordBelow(state, mr, plan.parentOf(mr));
  await deps.saveState(mr.project, state);
  await sink.setMr(mr, { status: 'up_to_date' });
  return true;
}
