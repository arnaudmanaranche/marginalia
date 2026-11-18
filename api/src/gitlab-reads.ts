import { findNoteIdByBody, isNotFound, latestPeerNoteAt, toDiscussions } from './gitlab-notes.ts';
import { mrPath } from './gitlab-http.ts';

// Reads of the MRs and their discussions, and the approval. `client` is a GitLab REST client
// (gitlab-http.ts), `me` the token owner's username. Draft notes are in gitlab-draft-ops.ts,
// versions in gitlab-version-ops.ts, the pure readers of the API's answers in gitlab-notes.ts.
// Every call is about one GitLab project: `project` (src/project.ts), or `mr.project`.
export function readsOf(client: any, me: string) {
  const rawDiscussions = (project: any, iid: number) => client.paginate(`${mrPath(project, iid)}/discussions`);
  const lastPushAt = async (mr: any) => {
    // The MR list's updated_at also moves on comments, so the last push time comes
    // from the diff versions (newest first).
    const versions = await client.request(`${mrPath(mr.project, mr.iid)}/versions?per_page=1`);
    return versions.length ? new Date(versions[0].created_at).getTime() : null;
  };
  return {
    openMergeRequests: (project: any) => client.paginate(`/projects/${project.encodedId}/merge_requests?state=opened&order_by=updated_at&sort=desc`),
    listMergeRequestDiffs: (project: any, iid: number) => client.paginate(`${mrPath(project, iid)}/diffs`),
    lastPushAt,
    latestPeerCommentAt: async (mr: any) => latestPeerNoteAt(await rawDiscussions(mr.project, mr.iid), me),
    // The id of my published note whose text is `body` (a draft that left the drafts list was
    // published, possibly from GitLab's own UI), else null.
    findPublishedNoteId: async (project: any, iid: number, body: string) => findNoteIdByBody(await rawDiscussions(project, iid), me, body),
    // False only when GitLab says the note is gone (404, i.e. deleted); any other failure throws
    // so the caller keeps what it has.
    async mergeRequestNoteExists(project: any, iid: number, noteId: number | string) {
      try {
        await client.request(`${mrPath(project, iid)}/notes/${noteId}`);
        return true;
      } catch (err) {
        if (isNotFound(err)) return false;
        throw err;
      }
    },
    // The discussions as GitLab sends them, system notes included (the MR's real history).
    listRawDiscussions: rawDiscussions,
    // Discussion threads, human notes only, so a re-review can see what was answered since the last one.
    listDiscussions: async (project: any, iid: number) => toDiscussions(await rawDiscussions(project, iid), me),
    // Approves the MR as the token's owner. `sha`, when given, must still be the MR's head or
    // GitLab answers 409: the approval then only covers the code that was reviewed.
    approveMergeRequest: (project: any, iid: number, sha?: string) => client.request(`${mrPath(project, iid)}/approve`, { method: 'POST', body: JSON.stringify(sha ? { sha } : {}) }),
    getProject: (project: any) => client.request(`/projects/${project.encodedId}`),
    // One page only: the recent branches are what matter.
    listBranches: (project: any) => client.request(`/projects/${project.encodedId}/repository/branches?sort=updated_desc&per_page=100`),
    getMergeRequest: (project: any, iid: number | string) => client.request(mrPath(project, iid)),
    currentUser: () => client.request('/user'),
    listReviewers: (project: any, iid: number) => client.request(`${mrPath(project, iid)}/reviewers`),
    getApprovals: (project: any, iid: number) => client.request(`${mrPath(project, iid)}/approvals`),
  };
}
