import { Jobs } from '@worldia/marginalia-contract';
import { listJobs } from '../job-list.ts';
import { visibleProjects } from './request-scope.ts';
import { readStatus } from './context.ts';
import { jsonOf, route } from './route-kit.ts';
import { limitQuery, titlesByReview } from './read-kit.ts';

// The factory's jobs across the projects this person can see, newest first: what ran, on what,
// how it ended and why, so nothing the bot does is out of sight (ADR 0006).
export function jobRoutes(app: any) {
  app.openapi(route({
    method: 'get', path: '/api/jobs', tags: ['Runs'], operationId: 'listJobs',
    summary: 'The latest jobs of every line', description: 'Newest first, without their steps. A job in progress has `outcome: running`.',
    request: { query: limitQuery },
    responses: { 200: jsonOf(Jobs, 'The jobs.') }, errors: [400],
  }), async (c: any) => {
    const { limit } = c.req.valid('query');
    const status = await readStatus();
    return c.json({ jobs: await listJobs(visibleProjects().map((p: any) => p.key), { limit, titles: titlesByReview(status) }) }, 200);
  });
}
