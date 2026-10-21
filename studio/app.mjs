import { OpenAPIHono } from '@hono/zod-openapi';
import { errorHandler, requirePosting, requirePush, validationHook, writeGuard } from './guards.mjs';
import { readRoutes } from './routes-read.mjs';
import { writeRoutes } from './routes-write.mjs';
import { actionRoutes } from './routes-actions.mjs';
import { liveRoutes, serveStatic } from './routes-live.mjs';

const DESCRIPTION = `The contract between the studio server and the React app. Generated from the zod schemas the routes validate with.

**Local only.** The server binds to \`127.0.0.1\` (default port \`4477\`) and is a thin layer over the review files, \`status.json\`, and the GitLab API called with the owner's \`GITLAB_TOKEN\`.

**Reviews are addressed as \`<project key>/<file name>\`**, URL-encoded in paths (\`back%2Ffeat-x\`): one install can watch several GitLab projects.

**Write endpoints** (\`PUT\`, \`POST\`, \`DELETE\`) only accept requests whose \`Host\` is the studio itself and whose \`Origin\`, when present, is too (DNS-rebinding and cross-site protection). Bodies must be \`application/json\` and under 20 kB.

**Posting is opt-in.** Everything that touches GitLab drafts or posting answers \`403\` unless the server runs with \`ALLOW_POSTING=true\`; pushing needs \`ALLOW_PUSH=true\`. The merge request is always resolved server-side from \`status.json\` using the review id, never taken from a request.`;

// `hosts` returns the Host values that count as the studio itself (default: from STUDIO_PORT).
export function createApp({ hosts } = {}) {
  const app = new OpenAPIHono({ defaultHook: validationHook });
  app.onError(errorHandler);

  app.use('/api/*', writeGuard(hosts));
  app.use('/api/post', requirePosting);
  app.use('/api/submit-review', requirePosting);
  app.use('/api/drafts/*', requirePosting);
  app.use('/api/push', requirePush);

  readRoutes(app);
  writeRoutes(app);
  actionRoutes(app);
  liveRoutes(app);

  app.doc31('/openapi.json', {
    openapi: '3.1.0',
    info: { title: 'Marginalia studio API', version: '2.0.0', description: DESCRIPTION },
    servers: [{ url: 'http://localhost:4477', description: 'Studio server (`npm start`). In dev the Vite proxy forwards `/api` and `/events` here.' }],
    tags: [{ name: 'Reviews' }, { name: 'Settings' }, { name: 'Pending review' }, { name: 'Triage fixes' }],
  });

  // Anything else: a write is refused, a read is the app (its own routes live in the browser).
  app.notFound((c) => (c.req.method === 'GET' ? serveStatic(c) : c.json({ error: 'read-only' }, 405)));
  return app;
}
