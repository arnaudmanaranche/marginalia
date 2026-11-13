import { z } from '@hono/zod-openapi';
import { DATA_DIR } from '../config.ts';
import { readFile } from 'node:fs/promises';
import { join } from 'node:path';
import { evidenceFolder, evidenceType } from '../verify-evidence.ts';
import { visibleProjects } from './request-scope.ts';
import { route } from './route-kit.ts';

export function evidenceRoute(app: any) {
  // A file a browser reproduction kept (ADR 0010): only the names the browse tool writes, by their type.
  app.openapi(route({
    method: 'get', path: '/api/evidence/{project}/{id}/{name}', tags: ['Reviews'], operationId: 'getEvidence',
    summary: 'A file kept by a browser reproduction', request: { params: z.object({ project: z.string(), id: z.string(), name: z.string() }) },
    responses: { 200: { description: 'The file.', content: { 'image/png': { schema: z.string().openapi({ format: 'binary' }) }, 'text/plain': { schema: z.string() } } } }, errors: [404],
  }), async (c: any) => {
    const { project, id, name } = c.req.valid('param');
    const type = evidenceType(name);
    if (!type || !/^[\w-]{1,120}$/.test(id) || !visibleProjects().some((p: any) => p.key === project)) return c.json({ error: 'no such evidence' }, 404);
    try {
      return c.body(await readFile(join(evidenceFolder(DATA_DIR, project, id), name)), 200, { 'content-type': type, 'cache-control': 'private, max-age=3600', 'x-content-type-options': 'nosniff', 'content-security-policy': "default-src 'none'; sandbox" });
    } catch {
      return c.json({ error: 'no such evidence' }, 404);
    }
  });
}
