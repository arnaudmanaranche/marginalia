import { z } from '@hono/zod-openapi';
import { artifactAt } from '../artifact.ts';
import { filesForPatterns, toDiffFile } from '../mr-diff.ts';
import { diffSincePush, reviewDiff, reviewPushes } from '../review-diff.ts';
import { reviewThreads } from '../review-threads.ts';
import { gitlab } from '../gitlab-api.ts';
import { Diff, Drafts, Pushes, Threads } from '@worldia/marginalia-contract';
import { jsonOf, route } from './route-kit.ts';
import { shortMessage } from './context.ts';
import { slug, tracked } from './read-kit.ts';

// What a tracked merge request has on GitLab right now: threads, diff, pushes and drafts.
export function mrReadRoutes(app: any) {
  app.openapi(route({
    method: 'get', path: '/api/reviews/{slug}/threads', tags: ['Reviews'], operationId: 'getThreads',
    summary: 'Threads on lines of code', description: 'The MR\'s discussion threads that sit on a line, for the diff, or with `scope=all` every thread (general comments too). `outdated` is a thread opened on an earlier version of the MR.',
    request: { params: slug, query: z.object({ scope: z.enum(['lines', 'all']).optional() }) }, responses: { 200: jsonOf(Threads, 'The threads.') }, errors: [400, 404, 502],
  }), async (c: any) => {
    const found = await tracked(c, c.req.valid('param').slug);
    if (found.reply) return found.reply;
    try {
      return c.json({ threads: await reviewThreads(found.project, found.mr, { all: c.req.valid('query').scope === 'all' }) }, 200);
    } catch (err) {
      return c.json({ error: shortMessage(err) }, 502);
    }
  });

  app.openapi(route({
    method: 'get', path: '/api/reviews/{slug}/diff', tags: ['Reviews'], operationId: 'getDiff',
    summary: 'The MR diff',
    description: 'Live diff of the MR, or of one tour stop. With `version`, the diff as an earlier review saw it; with `from` (the head commit of one of the MR\'s pushes), what changed after that push up to the head now.',
    request: { params: slug, query: z.object({ version: z.string().regex(/^[\w-]+$/).optional(), from: z.string().regex(/^[0-9a-f]{7,64}$/).optional(), stop: z.string().optional() }) },
    responses: { 200: jsonOf(Diff, 'The changed files.') }, errors: [400, 404, 502],
  }), async (c: any) => {
    const found = await tracked(c, c.req.valid('param').slug);
    if (found.reply) return found.reply;
    const { project, mr } = found;
    const { version: versionId = null, from = null, stop: stopId = null } = c.req.valid('query');
    try {
      // The live diff, unless it is about what an earlier review saw or what changed after a push.
      if (versionId || from) {
        const { status, ...body } = versionId
          ? await reviewDiff(project, mr, found.slug!, { versionId, stopId })
          : await diffSincePush(project, mr, found.slug!, { from, stopId });
        return c.json(body, status);
      }
      let files = (await gitlab.listMergeRequestDiffs(project, mr.iid)).map(toDiffFile);
      if (stopId) {
        const shape = await artifactAt(project.reviewsDir, found.slug!).readShape();
        const stop = (shape.tour ?? []).find((s: any) => s.id === stopId);
        files = stop ? filesForPatterns(files, stop.files) : [];
      }
      return c.json({ files }, 200);
    } catch (err) {
      return c.json({ error: shortMessage(err) }, 502);
    }
  });

  app.openapi(route({
    method: 'get', path: '/api/reviews/{slug}/pushes', tags: ['Reviews'], operationId: 'getPushes',
    summary: 'The MR\'s pushes',
    description: 'Oldest first, each with the commits it added, and where your last review on GitLab and the bot\'s reports sit. `defaultFrom` is where to start reading: after the push you last reviewed.',
    request: { params: slug }, responses: { 200: jsonOf(Pushes, 'The pushes.') }, errors: [400, 404, 502],
  }), async (c: any) => {
    const found = await tracked(c, c.req.valid('param').slug);
    if (found.reply) return found.reply;
    try {
      return c.json(await reviewPushes(found.project, found.mr, found.slug!), 200);
    } catch (err) {
      return c.json({ error: shortMessage(err) }, 502);
    }
  });

  app.openapi(route({
    method: 'get', path: '/api/drafts/{slug}', tags: ['Pending review'], operationId: 'listDrafts',
    summary: 'Your pending drafts on the MR', description: 'Includes drafts started in GitLab itself. Requires `ALLOW_POSTING=true`.',
    request: { params: slug }, responses: { 200: jsonOf(Drafts, 'The drafts.') }, errors: [400, 403, 404, 502],
  }), async (c: any) => {
    const found = await tracked(c, c.req.valid('param').slug);
    if (found.reply) return found.reply;
    try {
      return c.json({ drafts: await gitlab.listDraftNotes(found.project, found.mr.iid) }, 200);
    } catch (err) {
      return c.json({ error: shortMessage(err) }, 502);
    }
  });
}
