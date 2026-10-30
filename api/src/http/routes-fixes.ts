import { fixesStatus, pushFixes } from '../fixes.ts';
import { pushOneFix } from '../fixes-push.ts';
import { FixesStatus, PushRequest, ReviewId } from '@worldia/marginalia-contract';
import { z } from '@hono/zod-openapi';
import { jsonBody, jsonOf, route } from './route-kit.ts';
import { locate, serialQueue, shortMessage } from './context.ts';

// Two clicks must not race on the same push.
const pushQueue = serialQueue();

export function fixesRoutes(app: any) {
  // Where the local fixes of one triage stand against its MR branch on origin.
  app.openapi(route({
    method: 'get', path: '/api/fixes/{slug}', tags: ['Triage fixes'], operationId: 'getFixes',
    summary: 'Where a triage\'s fixes stand', description: '`ready` (on top of the MR head, can be pushed), `pushed`, `outdated` (the branch moved since) or `none`.',
    request: { params: z.object({ slug: ReviewId }) },
    responses: { 200: jsonOf(FixesStatus, 'The fixes against the MR branch.') }, errors: [400, 404, 502],
  }), async (c: any) => {
    const found = await locate(c.req.valid('param').slug);
    const mr = found?.mr;
    if (!found || mr?.kind !== 'comments' || !mr.sourceBranch) return c.json({ error: 'no tracked triage for this slug' }, 404);
    try {
      return c.json(await fixesStatus(found.project, { iid: mr.iid, source_branch: mr.sourceBranch }), 200);
    } catch (err) {
      return c.json({ error: shortMessage(err) }, 502);
    }
  });

  // Pushes the local fixes of one triage to its MR branch, only if that branch hasn't moved since
  // (fast-forward).
  app.openapi(route({
    method: 'post', path: '/api/push', tags: ['Triage fixes'], operationId: 'pushFixes',
    summary: 'Push a triage\'s fixes to the MR branch', description: 'Only on your own merge request (a `comments` triage). Fast-forward only. With `sha`, that one fix alone: the others are replayed on top of it, still to push.',
    request: { body: jsonBody(PushRequest) },
    responses: { 200: jsonOf(FixesStatus, 'Pushed; the status after the push.') }, errors: [400, 403, 404, 409, 415, 502],
  }), (c: any) => pushQueue(async () => {
    const { slug, sha } = c.req.valid('json');
    const found = await locate(slug);
    const mr = found?.mr;
    if (!found || mr?.kind !== 'comments' || !mr.sourceBranch) return c.json({ error: 'no tracked triage for this slug' }, 404);
    const target = { iid: mr.iid, source_branch: mr.sourceBranch };
    try {
      if (sha) {
        const one = await pushOneFix(found.project, target, sha);
        if (!one.pushed) return c.json({ error: one.error, status: one.status }, 409);
        return c.json(one.status, 200);
      }
      const { pushed, status } = await pushFixes(found.project, target);
      if (!pushed) return c.json({ error: status.state === 'outdated' ? 'the MR branch moved since the triage: re-run it' : `nothing to push (${status.state})`, status }, 409);
      return c.json(status, 200);
    } catch (err) {
      return c.json({ error: String(err.stderr || err.message).trim().slice(0, 300) }, 502);
    }
  }));
}
