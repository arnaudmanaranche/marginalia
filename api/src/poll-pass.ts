import { logger } from './logger.ts';
import { needsTriage, planMergeRequests, pruneState, triageSignal } from './poll-plan.ts';
import { buildEntries } from './poll-pass-entries.ts';
import { trustExistingReview, workOnMr } from './poll-pass-mr.ts';
import { branchStateKey } from './own-branches-plan.ts';

// One pass over one project's open MRs: decide what each needs (reviewed, triaged, nothing), show
// where every MR stands, do the work one MR at a time, and keep what was done in the state. It
// imports no config and starts nothing by itself: everything outside reaches it through `deps`
// (poll-pass-deps.ts wires the real ones, tests pass fakes), and what the bot shows goes through
// `sink` (statusSink in status.ts). Returns { retrySoon }: a failure that passes by itself
// happened, so the next poll should come sooner.
//
// deps: listOpenMergeRequests(project), latestPeerCommentAt(mr), reviewFileCoversLastPush(mr),
//   fetchReviewStates(project, mrs), jiraPriorityOf(mr), mtime(path), reviewPath(mr), commentsPath(mr),
//   ownPath(mr), listOwnBranches(project, openMrs, state), runReview(mr, path, stack, { own }), runMrComments(mr), loadState(project), saveState(project, state),
//   allowedTargets(project), settlesConflicts(project), username, notify(title, message, path),
//   trackFailure({ mr, kind, command, error }), startDoctor({ project, fileSlug, runId, auto }).
// sink: begin(mr), setMr(mr, patch), end(), entriesOf(project), setEntries(project, entries).
export async function passOver(project: any, deps: any, sink: any) {
  const state = await deps.loadState(project);
  const openMrs = await deps.listOpenMergeRequests(project);
  const plan = planMergeRequests({
    openMrs,
    state,
    allowedTargets: deps.allowedTargets(project),
    username: deps.username,
    triageEnabled: Boolean(project.triageCommand),
    reviewOwn: project.reviewOwn,
  });
  const { reviewMrs, myMrs, ownMrs } = plan;

  const toReview = reviewMrs.filter((mr: any) => !plan.isCurrent(mr));
  // An own MR whose branch was already reviewed at this sha, before the MR existed, is current.
  const toOwn = ownMrs.filter((mr: any) => !plan.isCurrent(mr) && state[branchStateKey(mr.source_branch)] !== mr.sha);
  // My branches without an MR, when they cannot be listed the pass goes on without them.
  const branches = project.reviewOwn
    ? await deps.listOwnBranches(project, openMrs, state).catch((err: any) => (logger.warn({ err, project: project.key }, 'Could not list my branches'), []))
    : [];
  const peerCommentAts = await Promise.all(myMrs.map((mr: any) => deps.latestPeerCommentAt(mr)));
  // GitLab's has_conflicts: the staged triage merges the target in and settles them.
  const settles = deps.settlesConflicts(project);
  const mine = myMrs.map((mr: any, i: any) => ({ mr, signal: triageSignal(peerCommentAts[i], settles && mr.has_conflicts ? mr.sha : null) }));
  const toTriage = mine.filter(({ mr, signal }: any) => needsTriage(state, mr, signal));

  await sink.setEntries(project, await buildEntries({ project, plan, state, mine, branches, previous: sink.entriesOf(project), deps }));
  logger.info({ project: project.key }, `${reviewMrs.length} MR(s) to review, ${myMrs.length} of my own — ${toReview.length} need a review, ${toOwn.length + branches.filter((b: any) => !b.current).length} an own review, ${toTriage.length} comment triage.`);

  const outcome = { retrySoon: false };
  const pass = { deps, sink, state, outcome };
  for (const mr of toReview) {
    if (!(await trustExistingReview(mr, plan, pass))) await workOnMr('review', mr, { plan }, pass);
  }
  for (const mr of toOwn) await workOnMr('own', mr, { plan }, pass);
  for (const { target } of branches.filter((b: any) => !b.current)) await workOnMr('branch', target, {}, pass);
  for (const { mr, signal } of toTriage) await workOnMr('triage', mr, { signal }, pass);

  pruneState(state, new Set([...[...reviewMrs, ...ownMrs].map((mr: any) => String(mr.iid)), ...[...ownMrs, ...branches.map((b: any) => b.target)].map((t: any) => branchStateKey(t.source_branch))]), new Set(myMrs.map((mr: any) => String(mr.iid))));
  await deps.saveState(project, state);
  return outcome;
}
