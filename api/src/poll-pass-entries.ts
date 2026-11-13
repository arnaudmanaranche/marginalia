import { needsTriage } from './poll-plan.ts';
import { commentsEntry, reviewEntry } from './poll-status.ts';

// The status entries of one project's pass (see poll-pass.ts): reads what each one shows (file
// times, Jira priority, where the MR stands on GitLab) through `deps`, then builds them with
// poll-status.ts. `mine` is [{ mr, signal }]; `previous` the project's entries of the last pass.
// `branches` is [{ target, current }]: my branches without an MR (own-branches.ts).
export async function buildEntries({ project, plan, state, mine, branches = [], previous, deps }: any) {
  const { reviewMrs, myMrs, ownMrs = [] } = plan;
  // When each review/report was written doubles as "last reviewed at" (writtenAtOf: the time it
  // stores, else its file's), so files written by hand or before this field existed get a date too.
  const reviewedAts = await Promise.all(reviewMrs.map((mr: any) => deps.mtime(deps.reviewPath(mr))));
  const triagedAts = await Promise.all(myMrs.map((mr: any) => deps.mtime(deps.commentsPath(mr))));
  const ownedAts = await Promise.all(ownMrs.map((mr: any) => deps.mtime(deps.ownPath(mr))));
  const branchAts = await Promise.all(branches.map(({ target }: any) => deps.mtime(deps.ownPath(target))));
  const jiras = await Promise.all(reviewMrs.map((mr: any) => deps.jiraPriorityOf(mr)));
  // Where each MR really stands for me, read from GitLab. One that cannot be read keeps what it had.
  const states = await deps.fetchReviewStates(project, [...reviewMrs, ...myMrs]);
  const stateOf = (mr: any) => states.get(mr.iid) ?? previous.find((m: any) => m.iid === mr.iid)?.myState ?? null;
  return [
    ...reviewMrs.map((mr: any, i: number) => reviewEntry(mr, { plan, reviewPath: deps.reviewPath(mr), reviewedAtMs: reviewedAts[i], jira: jiras[i], myState: stateOf(mr) })),
    ...ownMrs.map((mr: any, i: number) => ({ ...reviewEntry(mr, { plan, reviewPath: deps.ownPath(mr), reviewedAtMs: ownedAts[i], jira: null, myState: stateOf(mr) }), kind: 'own' })),
    ...branches.map(({ target, current }: any, i: number) => ({
      ...reviewEntry(target, { plan, reviewPath: deps.ownPath(target), reviewedAtMs: branchAts[i], jira: null, myState: null }),
      kind: 'own',
      status: current ? 'up_to_date' : 'pending',
    })),
    ...mine.map(({ mr, signal }: any, i: number) => commentsEntry(mr, {
      // No peer comment and no conflict counts as "up to date": there is nothing to triage yet.
      pending: needsTriage(state, mr, signal),
      reviewPath: deps.commentsPath(mr),
      reviewedAtMs: triagedAts[i],
      myState: stateOf(mr),
    })),
  ];
}
