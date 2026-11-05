import { gitlab } from './gitlab-api.ts';
import { warn } from './log.ts';
import { GITLAB_USERNAME } from './config.ts';
import { computeReviewState } from './review-state.ts';

// Reads where an MR really stands for me from GitLab (see review-state.ts). One MR is five
// calls; a failure of the optional ones (reviewers, approvals, pushes, drafts) only makes
// the picture a little poorer, while without the discussions there is no picture at all.
const orElse = (promise: Promise<any>, fallback: any) => promise.catch(() => fallback);

// `mr` is a GitLab MR, or a status entry: all that is read is its iid and its author.
export async function fetchReviewState(project: any, mr: any, api = gitlab) {
  const author = mr.author?.username ?? mr.author ?? null;
  const [discussions, reviewers, approvals, pushedAt, drafts] = await Promise.all([
    api.listRawDiscussions(project, mr.iid),
    orElse(api.listReviewers(project, mr.iid), []),
    orElse(api.getApprovals(project, mr.iid), null),
    orElse(api.lastPushAt({ iid: mr.iid, project }), null),
    orElse(api.listDraftNotes(project, mr.iid), []),
  ]);
  return computeReviewState({
    me: GITLAB_USERNAME,
    author,
    discussions,
    reviewers,
    approvedBy: (approvals?.approved_by ?? []).map((a: any) => a.user?.username),
    lastPushAt: pushedAt,
    drafts: drafts.length,
  });
}

// iid -> state, or null for an MR that could not be read. A few at a time: it is many calls.
export async function fetchReviewStates(project: any, mrs: any[], limit = 4) {
  const states = new Map();
  const queue = [...mrs];
  const worker = async () => {
    for (let mr = queue.shift(); mr; mr = queue.shift()) {
      try {
        states.set(mr.iid, await fetchReviewState(project, mr));
      } catch (err: any) {
        warn({ ...mr, project }, `Could not read where it stands: ${String(err.message).slice(0, 120)}`);
        states.set(mr.iid, null);
      }
    }
  };
  await Promise.all(Array.from({ length: Math.min(limit, queue.length) }, worker));
  return states;
}
