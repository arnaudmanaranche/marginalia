import { basename } from 'node:path';
import { z } from '@hono/zod-openapi';
import { QueueView } from '@worldia/marginalia-contract';
import { botQueue } from '../bot-queue.ts';
import { listJobs } from '../job-list.ts';
import { countFinished, recentTasks } from '../queue-store.ts';
import { queueView } from '../queue-view.ts';
import { getDb } from '../store.ts';
import { visibleProjects } from './request-scope.ts';
import { broadcast, readStatus } from './context.ts';
import { jsonOf, route } from './route-kit.ts';

// The bot's queue as the studio shows it: what waits and in which order, what runs and on what,
// what ended and the jobs each task started. A change in the queue wakes the open pages.
export function queueRoutes(app: any) {
  botQueue.onChange(broadcast);
  app.openapi(route({
    method: 'get', path: '/api/queue', tags: ['Runs'], operationId: 'getQueue',
    summary: 'The bot\'s queue of tasks', description: 'Waiting and running tasks first, then the latest finished ones. Tasks of projects this person cannot see are left out.',
    request: { query: z.object({ limit: z.coerce.number().int().min(1).max(200).optional() }) },
    responses: { 200: jsonOf(QueueView, 'The queue.') }, errors: [400],
  }), async (c: any) => {
    const { limit = 100 } = c.req.valid('query');
    const keys = visibleProjects().map((p: any) => p.key);
    const seen = new Set(keys);
    const status = await readStatus();
    const titles = new Map<string, string>((status?.mrs ?? [])
      .filter((m: any) => m.reviewPath && m.title)
      .map((m: any) => [`${m.project}/${basename(m.reviewPath, '.md')}`, m.title]));
    const db = getDb();
    const tasks = recentTasks(db, limit).filter((t) => t.project === null || seen.has(t.project));
    const jobs = await listJobs(keys, { limit: 200, titles });
    const current = status?.phase === 'reviewing' ? status.current : null;
    return c.json(queueView({ tasks, jobs, totals: countFinished(db), now: new Date().toISOString(), current }), 200);
  });
}
