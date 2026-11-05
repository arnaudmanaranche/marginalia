import { basename } from 'node:path';
import { z } from '@hono/zod-openapi';
import { Jobs } from '@worldia/marginalia-contract';
import { listJobs } from '../job-list.ts';
import { visibleProjects } from './request-scope.ts';
import { readStatus } from './context.ts';
import { jsonOf, route } from './route-kit.ts';

// The factory's jobs across the projects this person can see, newest first: what ran, on what,
// how it ended and why, so nothing the bot does is out of sight (ADR 0006).
export function jobRoutes(app: any) {
  app.openapi(route({
    method: 'get', path: '/api/jobs', tags: ['Runs'], operationId: 'listJobs',
    summary: 'The latest jobs of every line', description: 'Newest first, without their steps. A job in progress has `outcome: running`.',
    request: { query: z.object({ limit: z.coerce.number().int().min(1).max(200).optional() }) },
    responses: { 200: jsonOf(Jobs, 'The jobs.') }, errors: [400],
  }), async (c: any) => {
    const { limit } = c.req.valid('query');
    const status = await readStatus();
    const titles = new Map<string, string>((status?.mrs ?? [])
      .filter((m: any) => m.reviewPath && m.title)
      .map((m: any) => [`${m.project}/${basename(m.reviewPath, '.md')}`, m.title]));
    return c.json({ jobs: await listJobs(visibleProjects().map((p: any) => p.key), { limit, titles }) }, 200);
  });
}
