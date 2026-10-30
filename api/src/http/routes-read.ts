import { readFile } from 'node:fs/promises';
import { join } from 'node:path';
import { z } from '@hono/zod-openapi';
import { visibleProjects } from './request-scope.ts';
import { parseReviewId } from '../review-id.ts';
import { artifactAt } from '../artifact.ts';
import { buildShape } from '../findings.ts';
import { ReviewContent, ReviewId, ReviewsPayload, Version, Versions } from '@worldia/marginalia-contract';
import { jsonOf, route } from './route-kit.ts';
import { listReviews } from './reviews-list.ts';
import { kindOf } from './review-kind.ts';
import { badSlug, slug } from './read-kit.ts';
import { mrReadRoutes } from './routes-read-mr.ts';
import { imageRoute } from './routes-read-image.ts';

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
    const where = parseReviewId(id, visibleProjects());
    if (!where) return badSlug(c);
    try {
      const md = await readFile(join(where.project.reviewsDir, `${where.slug}.md`), 'utf8');
      return c.json({ slug: id, kind: kindOf(where.slug), markdown: md, shape: await artifactAt(where.project.reviewsDir, where.slug).readShape(md) }, 200);
    } catch {
      return c.json({ error: 'not found' }, 404);
    }
  });

  app.openapi(route({
    method: 'get', path: '/api/history/{slug}', tags: ['Reviews'], operationId: 'listHistory',
    summary: 'Earlier versions of a review', request: { params: slug },
    responses: { 200: jsonOf(Versions, 'Versions, newest first.') }, errors: [400],
  }), async (c) => {
    const where = parseReviewId(c.req.valid('param').slug, visibleProjects());
    if (!where) return badSlug(c);
    return c.json({ versions: await artifactAt(where.project.reviewsDir, where.slug).listHistory() }, 200);
  });

  app.openapi(route({
    method: 'get', path: '/api/history/{slug}/{id}', tags: ['Reviews'], operationId: 'getHistory',
    summary: 'One earlier version of a review', request: { params: z.object({ slug: ReviewId, id: z.string() }) },
    responses: { 200: jsonOf(Version, 'The version.') }, errors: [400, 404],
  }), async (c) => {
    const { slug: id, id: versionId } = c.req.valid('param');
    const where = parseReviewId(id, visibleProjects());
    if (!where) return badSlug(c);
    const version = await artifactAt(where.project.reviewsDir, where.slug).readHistory(versionId);
    if (version === null) return c.json({ error: 'not found' }, 404);
    return c.json({ slug: id, id: versionId, markdown: version.markdown, shape: version.shape ?? buildShape({ markdown: version.markdown }) }, 200);
  });

  mrReadRoutes(app);
  imageRoute(app);
}
