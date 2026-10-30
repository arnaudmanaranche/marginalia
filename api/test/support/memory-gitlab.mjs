// An in-memory GitLab behind the same interface as the REST adapter (lib/gitlab-api.mjs): what
// the studio's write path and mr-state ask of GitLab, answered from plain arrays. It models what
// callers react to: the draft-note lifecycle (create, list, edit, delete, publish into the
// discussions), approvals at a head sha, and the refusals they branch on (404 for a note that is
// gone, 400 for a line outside the diff, 409 for a moved head). Reads GitLab would paginate
// return what was seeded; everything else answers an empty value.
import { findNoteIdByBody, latestPeerNoteAt, toDiscussions, toDraft } from '../../dist/src/gitlab-notes.js';

const refusal = (status, what) => new Error(`GitLab API /${what} -> ${status}: {"message":"${status}"}`);

/** @param {{ me?: string, head?: string, diffLines?: Record<string, number[]> }} [options] `diffLines`: the lines of each path that are part of the MR diff. */
export function memoryGitlab({ me = 'me', head = 'head1', diffLines = {}, members = {} } = {}) {
  let nextId = 100;
  const id = () => (nextId += 1);
  // A discussion id is hex, as GitLab's are.
  const discussionId = () => String(id()).padStart(40, 'a');
  const at = () => new Date(Date.now() + nextId).toISOString();
  /** @type {any[]} */ const drafts = [];
  /** @type {any[]} */ const discussions = [];
  /** @type {string[]} */ const approvedBy = [];
  /** @type {{ iid: number, reviewerState: string | undefined, drafts: number }[]} */ const reviews = [];

  const note = (author, body, extra = {}) => ({ id: id(), body, author: { username: author }, system: false, created_at: at(), updated_at: at(), ...extra });
  const draftIndex = (draftId) => drafts.findIndex((d) => d.id === draftId);
  const requireDraft = (draftId) => {
    if (draftIndex(draftId) === -1) throw refusal(404, `draft_notes/${draftId}`);
    return drafts[draftIndex(draftId)];
  };
  const addDraft = (iid, fields) => {
    const draft = { id: id(), iid, ...fields };
    drafts.push(draft);
    return { id: draft.id, note: draft.note };
  };
  const mine = (iid) => drafts.filter((d) => d.iid === iid);

  const gitlab = {
    openMergeRequests: async () => [],
    listMergeRequestDiffs: async () => Object.keys(diffLines).map((path) => ({ old_path: path, new_path: path, diff: '' })),
    lastPushAt: async () => null,
    latestPeerCommentAt: async () => latestPeerNoteAt(discussions, me),
    findPublishedNoteId: async (_p, _iid, body) => findNoteIdByBody(discussions, me, body),
    mergeRequestNoteExists: async (_p, _iid, noteId) => discussions.some((d) => d.notes.some((n) => n.id === noteId)),
    listRawDiscussions: async () => discussions,
    listDiscussions: async () => toDiscussions(discussions, me),
    async approveMergeRequest(_p, _iid, sha) {
      if (sha && sha !== head) throw refusal(409, 'approve');
      if (!approvedBy.includes(me)) approvedBy.push(me);
      return {};
    },
    getProject: async (project) => ({ path_with_namespace: project.key }),
    getMergeRequest: async (_p, iid) => ({ iid, diff_refs: { base_sha: 'base', start_sha: 'start', head_sha: head } }),
    currentUser: async () => ({ username: me }),
    listReviewers: async () => [],
    getApprovals: async () => ({ approved_by: approvedBy.map((username) => ({ user: { username } })) }),

    createDraftNote: async (_p, iid, body) => addDraft(iid, { note: body }),
    createReplyDraftNote: async (_p, iid, discussionId, body, resolve) => {
      if (!discussions.some((d) => d.id === discussionId)) throw refusal(404, 'draft_notes');
      return addDraft(iid, { note: body, in_reply_to_discussion_id: discussionId, resolve_discussion: resolve });
    },
    createInlineDraftNote: async (_p, iid, body, path, line) => {
      if (line && !diffLines[path]?.includes(line)) throw refusal(400, 'draft_notes');
      return addDraft(iid, { note: body, position: { new_path: path, ...(line ? { new_line: line } : {}) } });
    },
    async publishDraftNotes(_p, iid, reviewerState) {
      const out = mine(iid);
      for (const d of out) {
        const reply = discussions.find((x) => x.id === d.in_reply_to_discussion_id);
        if (reply) reply.notes.push(note(me, d.note));
        else discussions.push({ id: discussionId(), notes: [note(me, d.note, d.position ? { position: d.position } : {})] });
        drafts.splice(draftIndex(d.id), 1);
      }
      reviews.push({ iid, reviewerState, drafts: out.length });
      return null;
    },
    listDraftNotes: async (_p, iid) => mine(iid).map(toDraft),
    async updateDraftNote(_p, _iid, draftId, body) {
      requireDraft(draftId).note = body;
      return {};
    },
    async deleteDraftNote(_p, _iid, draftId) {
      requireDraft(draftId);
      drafts.splice(draftIndex(draftId), 1);
      return null;
    },
    draftNoteExists: async (_p, _iid, draftId) => draftIndex(draftId) !== -1,

    memberAccessLevel: async (_p, username) => members[username] ?? 0,
    async replyToDiscussion(_p, _iid, discussionId, body) {
      const thread = discussions.find((d) => d.id === discussionId);
      if (!thread) throw refusal(404, 'discussions');
      const reply = note(me, body);
      thread.notes.push(reply);
      return reply;
    },

    listMergeRequestVersions: async () => [],
    getMergeRequestVersion: async () => ({}),
    compareDiffs: async () => [],
  };

  return {
    gitlab,
    drafts,
    discussions,
    approvedBy,
    reviews,
    // A thread a reviewer opened on the MR, as GitLab would hold it.
    seedThread: ({ author = 'alice', body, path = null, line = null }) => {
      const thread = { id: discussionId(), notes: [note(author, body, { resolvable: true, resolved: false, ...(path ? { position: { new_path: path, new_line: line } } : {}) })] };
      discussions.push(thread);
      return thread.id;
    },
  };
}
