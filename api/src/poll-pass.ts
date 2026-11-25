import { logger } from './logger.ts';
import { needsTriage, planMergeRequests, pruneState, triageSignal } from './poll-plan.ts';
import { buildEntries } from './poll-pass-entries.ts';
import { trustExistingReview, workOnMr } from './poll-pass-mr.ts';
import { heldBack } from './poll-pass-hold.ts';

// One pass over one project's open MRs: decide what each needs (reviewed, triaged, nothing), show
// where every MR stands, do the work one MR at a time, and keep what was done in the state. It
// imports no config and starts nothing by itself: everything outside reaches it through `deps`
// (poll-pass-deps.ts wires the real ones, tests pass fakes), and what the bot shows goes through
// `sink` (statusSink in status.ts). Returns { retrySoon }: a failure that passes by itself
// happened, so the next poll should come sooner.
//
// deps: listOpenMergeRequests(project), latestPeerCommentAt(mr), reviewFileCoversLastPush(mr),
//   fetchReviewStates(project, mrs), jiraPriorityOf(mr), mtime(path), reviewPath(mr), commentsPath(mr),
//   ownPath(mr), runReview(mr, path, stack, { own }), runMrComments(mr), loadState(project), saveState(project, state),
//   allowedTargets(project), username, notify(title, message, path),
//   trackFailure({ mr, kind, command, error }), startDoctor({ project, fileSlug, runId, auto }),
//   budget() (today's budget, budget.ts; once it is over, automatic work waits),
//   reviewFacts(mr) and staleAfterDays() (what holds an automatic review, poll-pass-hold.ts).
// sink: begin(mr), setMr(mr, patch), end(), entriesOf(project), setEntries(project, entries).
// `asked`: the MR a person asked to review again (a rerun task), or null for a poll.
export async function passOver(project: any, deps: any, sink: any, asked: any = null) {
  const state = await deps.loadState(project);
  const openMrs = await deps.listOpenMergeRequests(project);
  const plan = planMergeRequests({
    openMrs,
    state,
    allowedTargets: deps.allowedTargets(project),
    username: deps.username,
    triageEnabled: project.triage !== false,
    reviewOwn: project.reviewOwn,
  });
  const { reviewMrs, myMrs, ownMrs } = plan;

  const toReview = reviewMrs.filter((mr: any) => !plan.isCurrent(mr));
  const toOwn = ownMrs.filter((mr: any) => !plan.isCurrent(mr));
  const peerCommentAts = await Promise.all(myMrs.map((mr: any) => deps.latestPeerCommentAt(mr)));
  // GitLab's has_conflicts: the staged triage merges the target in and settles them.
  const mine = myMrs.map((mr: any, i: any) => ({ mr, signal: triageSignal(peerCommentAts[i], mr.has_conflicts ? mr.sha : null) }));
  const toTriage = mine.filter(({ mr, signal }: any) => needsTriage(state, mr, signal));

  await sink.setEntries(project, await buildEntries({ project, plan, state, mine, previous: sink.entriesOf(project), deps }));
  logger.info({ project: project.key }, `${reviewMrs.length} MR(s) to review, ${myMrs.length} of my own — ${toReview.length} need a review, ${toOwn.length} an own review, ${toTriage.length} comment triage.`);

  const outcome = { retrySoon: false };
  const pass: any = { deps, sink, state, outcome, asked, held: 0 };
  for (const mr of toReview) {
    if (await trustExistingReview(mr, plan, pass)) continue;
    if (!(await heldBack('review', mr, pass))) await workOnMr('review', mr, { plan }, pass);
  }
  for (const mr of toOwn) if (!(await heldBack('own', mr, pass))) await workOnMr('own', mr, { plan }, pass);
  for (const { mr, signal } of toTriage) await workOnMr('triage', mr, { signal }, pass);

  if (pass.held) logger.info({ project: project.key }, `Daily budget reached: ${pass.held} MR(s) wait until midnight.`);

  pruneState(state, new Set([...reviewMrs, ...ownMrs].map((mr: any) => String(mr.iid))), new Set(myMrs.map((mr: any) => String(mr.iid))));
  await deps.saveState(project, state);
  return outcome;
}
