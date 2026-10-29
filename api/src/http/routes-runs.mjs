// @ts-check
import { z } from '@hono/zod-openapi';
import { PROJECTS } from '../projects.mjs';
import { parseReviewId } from '../review-id.mjs';
import { listTraces, readRunPart, readTrace } from '../run-journal.mjs';
import { startDoctor } from '../doctor.mjs';
import { fixSource, pushFix, startFix } from '../doctor-fix.mjs';
import { Ok, ReviewId, RunTrace, Runs } from '@worldia/marginalia-contract';
import { broadcast } from './context.mjs';
import { jsonOf, route } from './route-kit.mjs';

// The runs of the bot on one review: queued, running, done or failed, each with the stages it went
// through. They are read from the run journal, so an MR with no report yet has them too.
export function runRoutes(app) {
  app.openapi(route({
    method: 'get', path: '/api/reviews/{slug}/runs', tags: ['Runs'], operationId: 'listRuns',
    summary: 'The runs of one review', description: 'Newest first, without their steps. The one in progress has `outcome: running`.',
    request: { params: z.object({ slug: ReviewId }) }, responses: { 200: jsonOf(Runs, 'The runs.') }, errors: [400],
  }), async (c) => {
    const where = parseReviewId(c.req.valid('param').slug, PROJECTS);
    if (!where) return c.json({ error: 'bad slug' }, 400);
    return c.json({ runs: await listTraces(where.project.key, where.slug) }, 200);
  });

  app.openapi(route({
    method: 'get', path: '/api/reviews/{slug}/runs/{runId}', tags: ['Runs'], operationId: 'getRun',
    summary: 'One run with its steps', request: { params: z.object({ slug: ReviewId, runId: z.string().regex(/^[\w-]+$/) }) },
    responses: { 200: jsonOf(RunTrace, 'The run.') }, errors: [400, 404],
  }), async (c) => {
    const { slug, runId } = c.req.valid('param');
    const where = parseReviewId(slug, PROJECTS);
    if (!where) return c.json({ error: 'bad slug' }, 400);
    const trace = await readTrace(where.project.key, where.slug, runId);
    if (!trace) return c.json({ error: 'no such run' }, 404);
    const { droppedSteps = 0, ...rest } = trace;
    const [doctor, fix, source] = await Promise.all([readRunPart(where.project.key, where.slug, runId, 'doctor'), readRunPart(where.project.key, where.slug, runId, 'fix'), fixSource()]);
    return c.json({ ...rest, stepCount: trace.steps.length + droppedSteps, doctor, fix, fixSource: { available: source.available, ...(source.why ? { why: source.why } : {}) } }, 200);
  });

  app.openapi(route({
    method: 'post', path: '/api/reviews/{slug}/runs/{runId}/doctor', tags: ['Runs'], operationId: 'startDoctor',
    summary: 'Ask the doctor why a run failed', description: 'Starts a read-only Claude run that reads the failed run and Marginalia\'s code; its diagnosis shows on the run when done.',
    request: { params: z.object({ slug: ReviewId, runId: z.string().regex(/^[\w-]+$/) }) },
    responses: { 200: jsonOf(Ok, 'Started.') }, errors: [400, 404, 409],
  }), async (c) => {
    const { slug, runId } = c.req.valid('param');
    const where = parseReviewId(slug, PROJECTS);
    if (!where) return c.json({ error: 'bad slug' }, 400);
    const started = await startDoctor({ project: where.project, fileSlug: where.slug, runId });
    if (!started.ok) return c.json({ error: started.error }, /** @type {404 | 409} */ (started.status));
    broadcast();
    return c.json({ ok: /** @type {const} */ (true) }, 200);
  });

  // The fix the doctor prepares on a branch of Marginalia, then pushes when the person says so.
  for (const [path, operationId, summary, act] of /** @type {const} */ ([
    ['/api/reviews/{slug}/runs/{runId}/doctor/fix', 'startDoctorFix', 'Have the doctor prepare the fix on a branch', startFix],
    ['/api/reviews/{slug}/runs/{runId}/doctor/fix/push', 'pushDoctorFix', 'Push the branch the doctor prepared', pushFix],
  ])) {
    app.openapi(route({
      method: 'post', path, tags: ['Runs'], operationId, summary,
      request: { params: z.object({ slug: ReviewId, runId: z.string().regex(/^[\w-]+$/) }) },
      responses: { 200: jsonOf(Ok, 'Done or started.') }, errors: [400, 404, 409, 502],
    }), async (c) => {
      const { slug, runId } = c.req.valid('param');
      const where = parseReviewId(slug, PROJECTS);
      if (!where) return c.json({ error: 'bad slug' }, 400);
      const done = await act({ project: where.project, fileSlug: where.slug, runId });
      if (!done.ok) return c.json({ error: done.error }, /** @type {404 | 409 | 502} */ (done.status));
      broadcast();
      return c.json({ ok: /** @type {const} */ (true) }, 200);
    });
  }
}
