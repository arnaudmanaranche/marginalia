import { z } from '@hono/zod-openapi';
import { postedKey } from '../lib/state-shape.mjs';
import { loadPosted, savePosted } from '../lib/posted.mjs';
import { loadState } from '../lib/state.mjs';
import { reviewerStateFor } from '../lib/review-actions.mjs';
import { findPublishedNoteId, approveMergeRequest } from '../lib/gitlab.mjs';
import { createDraftNote, createInlineDraftNote, listDraftNotes, updateDraftNote, deleteDraftNote, publishDraftNotes } from '../lib/gitlab-drafts.mjs';
import { AddToReviewRequest, DraftEdit, Ok, PostedInfo, ReviewId, SubmitRequest, Submitted } from './schemas.mjs';
import { jsonBody, jsonOf, route } from './route-kit.mjs';
import { broadcast, locate, postQueue, refreshState, shortMessage } from './context.mjs';

const gone = (c, status = 404) => c.json({ error: 'no tracked merge request for this review' }, status);

// Comments go up as GitLab draft notes (the "pending review"): private to the token's owner until
// submitted. The MR is always resolved server-side from status.json, never taken from the request.
export function writeRoutes(app) {
  // Posts one comment: inline on path:line when given, else (or if GitLab refuses the anchor)
  // as a general comment.
  app.openapi(route({
    method: 'post', path: '/api/post', tags: ['Pending review'], operationId: 'addToReview',
    summary: 'Add a comment to your pending review',
    description: 'Requires `ALLOW_POSTING=true`. A GitLab draft note, invisible to others until the review is submitted. The same comment cannot be added twice.',
    request: { body: jsonBody(AddToReviewRequest) },
    responses: { 200: jsonOf(PostedInfo, 'The comment as recorded.') }, errors: [400, 403, 404, 409, 415, 502],
  }), (c) => postQueue(async () => {
    const { slug, commentId, body, path, line } = c.req.valid('json');
    const found = await locate(slug);
    if (!found?.mr) return gone(c);
    const { project, mr } = found;
    const posted = await loadPosted();
    const key = postedKey(project.key, found.slug, commentId);
    if (posted[key]) return c.json({ error: 'already posted', posted: posted[key] }, 409);
    const hasTarget = path !== undefined || line !== undefined;
    let draft;
    let text = body;
    let inline = false;
    try {
      if (hasTarget) {
        try {
          draft = await createInlineDraftNote(project, mr.iid, text, path, line);
          inline = true;
        } catch (err) {
          // Typically a line outside the diff (400): keep the comment, drop the anchor.
          console.warn(`[studio] inline draft on ${path}${line ? `:${line}` : ''} failed, adding a general note: ${shortMessage(err).slice(0, 200)}`);
        }
      }
      if (!inline) {
        if (hasTarget) text = `\`${path}${line ? `:${line}` : ''}\`\n\n${text}`;
        draft = await createDraftNote(project, mr.iid, text);
      }
    } catch (err) {
      return c.json({ error: shortMessage(err) }, 502);
    }
    posted[key] = { at: new Date().toISOString(), iid: mr.iid, state: 'draft', draftId: draft.id, body: text, mrUrl: mr.web_url, url: mr.web_url, inline: hasTarget ? inline : undefined };
    await savePosted(posted);
    refreshState(project, mr);
    broadcast();
    return c.json(posted[key], 200);
  }));

  // Publishes the drafts of one review as a real GitLab review, with an optional summary note and
  // an action: comment, approve or request changes.
  app.openapi(route({
    method: 'post', path: '/api/submit-review', tags: ['Pending review'], operationId: 'submitReview',
    summary: 'Submit your pending review',
    description: 'Requires `ALLOW_POSTING=true`. Publishes every pending draft of the MR (including ones started in GitLab) as one review. `approve` also approves the MR at the reviewed commit.',
    request: { body: jsonBody(SubmitRequest) },
    responses: { 200: jsonOf(Submitted, 'What was submitted.') }, errors: [400, 403, 404, 415, 502],
  }), (c) => postQueue(async () => {
    const { slug, summary, action } = c.req.valid('json');
    const found = await locate(slug);
    if (!found?.mr) return gone(c);
    const { project, mr } = found;
    const posted = await loadPosted();
    const drafts = Object.entries(posted).filter(([key, info]) => key.startsWith(`${slug}:`) && info.state === 'draft');
    const text = summary?.trim();
    // Approving or requesting changes needs no comment: the verdict is the review.
    if (!drafts.length && !text && action === 'comment') return c.json({ error: 'nothing to submit' }, 400);
    try {
      if (text) await createDraftNote(project, mr.iid, text);
      // Drafts started in GitLab itself are not in the posted record: ask GitLab.
      const pending = drafts.length > 0 || Boolean(text) || (await listDraftNotes(project, mr.iid)).length > 0;
      if (pending || action === 'request_changes') await publishDraftNotes(project, mr.iid, reviewerStateFor(action));
    } catch (err) {
      return c.json({ error: shortMessage(err) }, 502);
    }
    let approveError = null;
    if (action === 'approve') {
      try {
        await approveMergeRequest(project, mr.iid, (await loadState(project))[mr.iid]);
      } catch (err) {
        approveError = shortMessage(err);
      }
    }
    for (const [key, info] of drafts) {
      let noteId = null;
      try {
        noteId = await findPublishedNoteId(project, info.iid, info.body);
      } catch {
        /* the review is out; only the deep link is missing */
      }
      const { draftId, ...rest } = info;
      posted[key] = { ...rest, state: 'published', at: new Date().toISOString(), url: noteId ? `${info.mrUrl}#note_${noteId}` : info.mrUrl };
    }
    await savePosted(posted);
    refreshState(project, mr);
    broadcast();
    // The comments are out either way: say so, so the user does not submit them twice.
    if (approveError) return c.json({ error: `Comments published, but the approval failed: ${approveError}` }, 502);
    return c.json({ submitted: drafts.length, summary: Boolean(text), action }, 200);
  }));

  const draftParams = z.object({ slug: ReviewId, id: z.coerce.number().int().min(0).max(999_999_999_999) });

  // Edits or deletes one pending draft, addressed under the MR resolved from status.json, so it
  // can't reach another MR's drafts.
  const mutate = (c, { edit }) => postQueue(async () => {
    const { slug, id: draftId } = c.req.valid('param');
    const found = await locate(slug);
    if (!found?.mr) return gone(c);
    const { project, mr } = found;
    const text = edit ? c.req.valid('json').body : null;
    try {
      if (edit) await updateDraftNote(project, mr.iid, draftId, text);
      else await deleteDraftNote(project, mr.iid, draftId);
    } catch (err) {
      return c.json({ error: shortMessage(err) }, / -> 404:/.test(String(err.message)) ? 404 : 502);
    }
    // Keep the local record in step: a deleted draft can be added again, an edited one keeps its new text for matching.
    const posted = await loadPosted();
    const entry = Object.entries(posted).find(([key, info]) => key.startsWith(`${project.key}/`) && info.state === 'draft' && info.draftId === draftId && info.iid === mr.iid);
    if (entry) {
      if (edit) posted[entry[0]] = { ...entry[1], body: text };
      else delete posted[entry[0]];
      await savePosted(posted);
    }
    refreshState(project, mr);
    broadcast();
    return c.json({ ok: true }, 200);
  });

  app.openapi(route({
    method: 'put', path: '/api/drafts/{slug}/{id}', tags: ['Pending review'], operationId: 'updateDraft',
    summary: 'Edit a pending draft', description: 'Requires `ALLOW_POSTING=true`.',
    request: { params: draftParams, body: jsonBody(DraftEdit) },
    responses: { 200: jsonOf(Ok, 'Done.') }, errors: [400, 403, 404, 415, 502],
  }), (c) => mutate(c, { edit: true }));

  app.openapi(route({
    method: 'delete', path: '/api/drafts/{slug}/{id}', tags: ['Pending review'], operationId: 'deleteDraft',
    summary: 'Delete a pending draft', description: 'Requires `ALLOW_POSTING=true`.',
    request: { params: draftParams }, responses: { 200: jsonOf(Ok, 'Done.') }, errors: [400, 403, 404, 502],
  }), (c) => mutate(c, { edit: false }));
}
