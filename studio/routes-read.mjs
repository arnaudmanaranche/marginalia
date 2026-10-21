import { readFile } from 'node:fs/promises';
import { join } from 'node:path';
import { z } from '@hono/zod-openapi';
import { GITLAB_BASE_URL, GITLAB_TOKEN } from '../lib/config.mjs';
import { PROJECTS } from '../lib/projects.mjs';
import { parseReviewId, projectOfUpload } from '../lib/review-id.mjs';
import { uploadFetchPath } from '../lib/gitlab-upload.mjs';
import { listHistory, readHistory } from '../lib/history.mjs';
import { buildShape, loadShape } from '../lib/findings.mjs';
import { filesForPatterns, toDiffFile } from '../lib/mr-diff.mjs';
import { reviewDiff } from '../lib/review-diff.mjs';
import { reviewThreads } from '../lib/review-threads.mjs';
import { listMergeRequestDiffs } from '../lib/gitlab.mjs';
import { listDraftNotes } from '../lib/gitlab-drafts.mjs';
import { Diff, Drafts, ReviewContent, ReviewId, ReviewsPayload, Threads, Version, Versions } from './schemas.mjs';
import { jsonOf, route } from './route-kit.mjs';
import { locate, shortMessage } from './context.mjs';
import { kindOf, listReviews } from './reviews-list.mjs';

const slug = z.object({ slug: ReviewId });
const badSlug = (c) => c.json({ error: 'bad slug' }, 400);
const notTracked = (c) => c.json({ error: 'no tracked merge request for this review' }, 404);

// The tracked MR of a review id, or the answer to give instead.
async function tracked(c, id) {
  const found = await locate(id);
  if (!found) return { reply: badSlug(c) };
  if (!found.mr) return { reply: notTracked(c) };
  return found;
}

export function readRoutes(app) {
  app.openapi(route({
    method: 'get', path: '/api/reviews', tags: ['Reviews'], operationId: 'listReviews',
    summary: 'List reviews and the bot state',
    description: 'Everything the home screen needs in one call. Also drops records of drafts or notes that were deleted on GitLab (throttled to once per 15 s).',
    responses: { 200: jsonOf(ReviewsPayload, 'The review list.') },
  }), async (c) => c.json(await listReviews(), 200));

  app.openapi(route({
    method: 'get', path: '/api/reviews/{slug}', tags: ['Reviews'], operationId: 'getReview',
    summary: 'Read one review as Markdown', request: { params: slug },
    responses: { 200: jsonOf(ReviewContent, 'The review file and its shape.') }, errors: [400, 404],
  }), async (c) => {
    const id = c.req.valid('param').slug;
    const where = parseReviewId(id, PROJECTS);
    if (!where) return badSlug(c);
    try {
      const md = await readFile(join(where.project.reviewsDir, `${where.slug}.md`), 'utf8');
      return c.json({ slug: id, kind: kindOf(where.slug), markdown: md, shape: await loadShape(where.project.reviewsDir, where.slug, md) }, 200);
    } catch {
      return c.json({ error: 'not found' }, 404);
    }
  });

  app.openapi(route({
    method: 'get', path: '/api/reviews/{slug}/threads', tags: ['Reviews'], operationId: 'getThreads',
    summary: 'Threads on lines of code', description: 'The MR\'s discussion threads that sit on a line, for the diff. `outdated` is a thread opened on an earlier version of the MR.',
    request: { params: slug }, responses: { 200: jsonOf(Threads, 'The threads.') }, errors: [400, 404, 502],
  }), async (c) => {
    const found = await tracked(c, c.req.valid('param').slug);
    if (found.reply) return found.reply;
    try {
      return c.json({ threads: await reviewThreads(found.project, found.mr) }, 200);
    } catch (err) {
      return c.json({ error: shortMessage(err) }, 502);
    }
  });

  app.openapi(route({
    method: 'get', path: '/api/reviews/{slug}/diff', tags: ['Reviews'], operationId: 'getDiff',
    summary: 'The MR diff',
    description: 'Live diff of the MR, or of one tour stop. With `version` or `mode=since`, the diff as an earlier review saw it, or what changed since.',
    request: { params: slug, query: z.object({ version: z.string().regex(/^[\w-]+$/).optional(), mode: z.enum(['full', 'since']).optional(), stop: z.string().optional() }) },
    responses: { 200: jsonOf(Diff, 'The changed files.') }, errors: [400, 404, 502],
  }), async (c) => {
    const found = await tracked(c, c.req.valid('param').slug);
    if (found.reply) return found.reply;
    const { project, mr } = found;
    const { version: versionId = null, mode = 'full', stop: stopId = null } = c.req.valid('query');
    try {
      // The live diff, unless it is about what an earlier review saw or what changed since it.
      if (versionId || mode === 'since') {
        const { status, ...body } = await reviewDiff(project, mr, found.slug, { versionId, mode, stopId });
        return c.json(body, status);
      }
      let files = (await listMergeRequestDiffs(project, mr.iid)).map(toDiffFile);
      if (stopId) {
        const shape = await loadShape(project.reviewsDir, found.slug, '');
        const stop = (shape.tour ?? []).find((s) => s.id === stopId);
        files = stop ? filesForPatterns(files, stop.files) : [];
      }
      return c.json({ files }, 200);
    } catch (err) {
      return c.json({ error: shortMessage(err) }, 502);
    }
  });

  app.openapi(route({
    method: 'get', path: '/api/history/{slug}', tags: ['Reviews'], operationId: 'listHistory',
    summary: 'Earlier versions of a review', request: { params: slug },
    responses: { 200: jsonOf(Versions, 'Versions, newest first.') }, errors: [400],
  }), async (c) => {
    const where = parseReviewId(c.req.valid('param').slug, PROJECTS);
    if (!where) return badSlug(c);
    return c.json({ versions: await listHistory(where.project.reviewsDir, where.slug) }, 200);
  });

  app.openapi(route({
    method: 'get', path: '/api/history/{slug}/{id}', tags: ['Reviews'], operationId: 'getHistory',
    summary: 'One earlier version of a review', request: { params: z.object({ slug: ReviewId, id: z.string() }) },
    responses: { 200: jsonOf(Version, 'The version.') }, errors: [400, 404],
  }), async (c) => {
    const { slug: id, id: versionId } = c.req.valid('param');
    const where = parseReviewId(id, PROJECTS);
    if (!where) return badSlug(c);
    const version = await readHistory(where.project.reviewsDir, where.slug, versionId);
    if (version === null) return c.json({ error: 'not found' }, 404);
    return c.json({ slug: id, id: versionId, markdown: version.markdown, shape: version.shape ?? buildShape({ markdown: version.markdown }) }, 200);
  });

  app.openapi(route({
    method: 'get', path: '/api/drafts/{slug}', tags: ['Pending review'], operationId: 'listDrafts',
    summary: 'Your pending drafts on the MR', description: 'Includes drafts started in GitLab itself. Requires `ALLOW_POSTING=true`.',
    request: { params: slug }, responses: { 200: jsonOf(Drafts, 'The drafts.') }, errors: [400, 403, 404, 502],
  }), async (c) => {
    const found = await tracked(c, c.req.valid('param').slug);
    if (found.reply) return found.reply;
    try {
      return c.json({ drafts: await listDraftNotes(found.project, found.mr.iid) }, 200);
    } catch (err) {
      return c.json({ error: shortMessage(err) }, 502);
    }
  });

  // An image a GitLab note embeds, fetched with the token (the browser has no GitLab login).
  app.openapi(route({
    method: 'get', path: '/api/gitlab-image', tags: ['Reviews'], operationId: 'getGitlabImage',
    summary: 'An image uploaded to a GitLab note', request: { query: z.object({ src: z.string().default('') }) },
    responses: { 200: { description: 'The image.', content: { 'image/*': { schema: z.string().openapi({ format: 'binary' }) } } } }, errors: [400, 404, 502],
  }), async (c) => {
    const { src } = c.req.valid('query');
    let project = null;
    try {
      project = projectOfUpload(new URL(src, GITLAB_BASE_URL).pathname, PROJECTS);
    } catch { /* not a URL: uploadFetchPath refuses it below */ }
    const path = project && uploadFetchPath(src, GITLAB_BASE_URL, project.encodedId);
    if (!path) return c.json({ error: 'not a GitLab upload' }, 400);
    try {
      const upstream = await fetch(`${GITLAB_BASE_URL}${path}`, { headers: { 'PRIVATE-TOKEN': GITLAB_TOKEN }, redirect: 'follow' });
      const type = upstream.headers.get('content-type') ?? '';
      if (!upstream.ok || !/^image\/(png|jpe?g|gif|webp|avif|bmp)/i.test(type)) return c.json({ error: 'image unavailable' }, 404);
      return c.body(await upstream.arrayBuffer(), 200, { 'content-type': type, 'cache-control': 'private, max-age=3600', 'x-content-type-options': 'nosniff' });
    } catch {
      return c.json({ error: 'image unavailable' }, 502);
    }
  });
}
