import { mrPath } from './gitlab-http.ts';
import { diffPosition, isNotFound, toDraft } from './gitlab-notes.ts';

// Comments from the studio go up as draft notes (GitLab's "Start a review"):
// private to the token's owner until publishDraftNotes() submits them all as
// one real review. They are per user and MR, so a bulk publish also sends any
// draft started in GitLab's own UI. `client` is a GitLab REST client (gitlab-http.ts).
export function draftsOf(client: any) {
  const post = (project: any, iid: any, payload: any) => client.request(`${mrPath(project, iid)}/draft_notes`, { method: 'POST', body: JSON.stringify(payload) });
  const draftPath = (project: any, iid: any, draftId: any) => `${mrPath(project, iid)}/draft_notes/${draftId}`;

  async function inlinePosition(project: any, iid: any, path: any, line: any) {
    const mr = await client.request(mrPath(project, iid));
    if (!mr.diff_refs) throw new Error('merge request has no diff_refs yet');
    const files = await client.paginate(`${mrPath(project, iid)}/diffs`);
    return diffPosition(mr.diff_refs, files, path, line);
  }

  return {
    // General (non-inline) draft comment on an MR.
    createDraftNote: (project: any, iid: any, body: any) => post(project, iid, { note: body }),
    // Draft reply inside an existing thread. `resolve` resolves the thread when the review is
    // submitted, as GitLab's "Resolve thread" checkbox under a reply does.
    createReplyDraftNote: (project: any, iid: any, discussionId: any, body: any, resolve: any) => post(project, iid, { note: body, in_reply_to_discussion_id: discussionId, resolve_discussion: resolve }),
    // Inline draft comment anchored on a line of the MR diff. GitLab refuses it (400) when the
    // line isn't part of the diff, hence the caller's fallback. `line` is a line number of the new
    // version of the file; without it the comment is attached to the whole file (GitLab 16.9+,
    // else the caller falls back).
    createInlineDraftNote: async (project: any, iid: any, body: any, path: any, line: any) => post(project, iid, { note: body, position: await inlinePosition(project, iid, path, line) }),
    // Submits every pending draft of the token's owner as one review. `reviewerState`
    // ('requested_changes') also marks the review as requesting changes.
    publishDraftNotes: (project: any, iid: any, reviewerState: any) => client.request(`${mrPath(project, iid)}/draft_notes/bulk_publish`, {
      method: 'POST',
      ...(reviewerState ? { body: JSON.stringify({ reviewer_state: reviewerState }) } : {}),
    }),
    // The token owner's pending drafts on the MR, including ones started in GitLab's UI.
    listDraftNotes: async (project: any, iid: any) => (await client.paginate(`${mrPath(project, iid)}/draft_notes`)).map(toDraft),
    updateDraftNote: (project: any, iid: any, draftId: any, body: any) => client.request(draftPath(project, iid, draftId), { method: 'PUT', body: JSON.stringify({ note: body }) }),
    deleteDraftNote: (project: any, iid: any, draftId: any) => client.request(draftPath(project, iid, draftId), { method: 'DELETE' }),
    async draftNoteExists(project: any, iid: any, draftId: any) {
      try {
        await client.request(draftPath(project, iid, draftId));
        return true;
      } catch (err) {
        if (isNotFound(err)) return false;
        throw err;
      }
    },
  };
}
