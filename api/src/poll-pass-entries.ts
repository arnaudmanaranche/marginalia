import { needsTriage } from './poll-plan.ts';
import { commentsEntry, reviewEntry } from './poll-status.ts';

// The status entries of one project's pass (see poll-pass.ts): reads what each one shows (file
// times, Jira priority, where the MR stands on GitLab) through `deps`, then builds them with
// poll-status.ts. `mine` is [{ mr, signal }]; `previous` the project's entries of the last pass.
export async function buildEntries({ project, plan, state, mine, previous, deps }: any) {
  const { reviewMrs, myMrs } = plan;
  // The review/report file's mtime doubles as "last reviewed at", so files
  // written by hand or before this field existed get a date too.
  const reviewedAts = await Promise.all(reviewMrs.map((mr: any) => deps.mtime(deps.reviewPath(mr))));
  const triagedAts = await Promise.all(myMrs.map((mr: any) => deps.mtime(deps.commentsPath(mr))));
  const jiras = await Promise.all(reviewMrs.map((mr: any) => deps.jiraPriorityOf(mr)));
  // Where each MR really stands for me, read from GitLab. One that cannot be read keeps what it had.
  const states = await deps.fetchReviewStates(project, [...reviewMrs, ...myMrs]);
  const stateOf = (mr: any) => states.get(mr.iid) ?? previous.find((m: any) => m.iid === mr.iid)?.myState ?? null;
  return [
    ...reviewMrs.map((mr: any, i: number) => reviewEntry(mr, { plan, reviewPath: deps.reviewPath(mr), reviewedAtMs: reviewedAts[i], jira: jiras[i], myState: stateOf(mr) })),
    ...mine.map(({ mr, signal }: any, i: number) => commentsEntry(mr, {
      // No peer comment and no conflict counts as "up to date": there is nothing to triage yet.
      pending: needsTriage(state, mr, signal),
      reviewPath: deps.commentsPath(mr),
      reviewedAtMs: triagedAts[i],
      myState: stateOf(mr),
    })),
  ];
}
