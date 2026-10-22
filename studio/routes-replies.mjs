// @ts-check
import { postedKey } from '../lib/state-shape.mjs';
import { loadPosted, savePosted } from '../lib/posted.mjs';
import { createReplyDraftNote } from '../lib/gitlab-drafts.mjs';
import { PostedInfo, ReplyRequest } from './schemas.mjs';
import { jsonBody, jsonOf, route } from './route-kit.mjs';
import { broadcast, locate, postQueue, refreshState, shortMessage } from './context.mjs';

// The comment id a reply is recorded under: one reply per thread.
export const replyCommentId = (threadId) => `reply-${threadId}`;

// On my own MR I answer the reviewers inside their threads. A reply goes up as a GitLab draft
// note in that thread, like the review comments: nobody sees it until the replies are submitted
// (POST /api/submit-review), which also resolves the threads it was asked to.
export function replyRoutes(app) {
  app.openapi(route({
    method: 'post', path: '/api/replies', tags: ['Replies'], operationId: 'addReply',
    summary: 'Reply in a reviewer thread of your own MR',
    description: 'Only on your own merge request (a `comments` triage). A draft note in the thread, sent with the other drafts on submit. One reply per thread.',
    request: { body: jsonBody(ReplyRequest) },
    responses: { 200: jsonOf(PostedInfo, 'The reply as recorded.') }, errors: [400, 403, 404, 409, 415, 502],
  }), (c) => postQueue(async () => {
    const { slug, threadId, body, resolve } = c.req.valid('json');
    const found = await locate(slug);
    if (!found?.mr) return c.json({ error: 'no tracked merge request for this review' }, 404);
    const { project, mr } = found;
    if (mr.kind !== 'comments') return c.json({ error: 'replies are only for your own merge requests' }, 403);
    const posted = await loadPosted();
    const key = postedKey(project.key, found.slug, replyCommentId(threadId));
    if (posted[key]) return c.json({ error: 'this thread already has a reply', posted: posted[key] }, 409);
    let draft;
    try {
      draft = await createReplyDraftNote(project, mr.iid, threadId, body, resolve);
    } catch (err) {
      return c.json({ error: shortMessage(err) }, / -> 404:/.test(String(err.message)) ? 404 : 502);
    }
    posted[key] = { at: new Date().toISOString(), iid: mr.iid, state: 'draft', draftId: draft.id, body, mrUrl: mr.web_url, url: mr.web_url, threadId, resolve };
    await savePosted(posted);
    refreshState(project, mr);
    broadcast();
    return c.json(posted[key], 200);
  }));
}
