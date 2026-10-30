import { OpenAPIHono } from '@hono/zod-openapi';
import { errorHandler, ownHosts, requirePosting, validationHook, writeGuard } from './guards.ts';
import { authRoutes } from './auth-routes.ts';
import { sessionMiddleware } from './auth-middleware.ts';
import { currentScope, scopedGitlab } from './request-scope.ts';
import type { AuthConfig } from '../auth-config.ts';
import { STUDIO_ALLOWED_HOSTS } from '../config.ts';
import { readRoutes } from './routes-read.ts';
import { writeRoutes } from './routes-write.ts';
import { actionRoutes } from './routes-actions.ts';
import { replyRoutes } from './routes-replies.ts';
import { runRoutes } from './routes-runs.ts';
import { liveRoutes, serveStatic } from './routes-live.ts';

const DESCRIPTION = `The contract between the studio server and the React app. Generated from the zod schemas the routes validate with.

**Local only.** The server binds to \`127.0.0.1\` (default port \`4477\`) and is a thin layer over the review files, \`status.json\`, and the GitLab API called with the owner's \`GITLAB_TOKEN\`.

**Reviews are addressed as \`<project key>/<file name>\`**, URL-encoded in paths (\`back%2Ffeat-x\`): one install can watch several GitLab projects.

**Write endpoints** (\`PUT\`, \`POST\`, \`DELETE\`) only accept requests whose \`Host\` is the studio itself and whose \`Origin\`, when present, is too (DNS-rebinding and cross-site protection). Bodies must be \`application/json\` and under 20 kB.

**Posting is opt-in on other people's merge requests.** Everything that touches GitLab drafts or posting answers \`403\` there unless the server runs with \`ALLOW_POSTING=true\`. On your own merge requests (a \`comments\` triage) replying to the threads, submitting those replies and pushing the triage's fixes are always available. The merge request is always resolved server-side from \`status.json\` using the review id, never taken from a request.`;

// `hosts` returns the Host values that count as the studio itself (default: from STUDIO_PORT).
// `auth`: hosted mode, the studio behind GitLab login (see auth-routes.ts). Without it nobody is
// signed in and the studio acts with the bot's token, as in local mode.
type AuthOptions = { config: AuthConfig; db: any; projects: { key: string; encodedId: string }[]; fetchFn?: typeof fetch; now?: () => number };
export function createApp({ hosts, gitlab, auth }: { hosts?: () => Set<string>; gitlab?: any; auth?: AuthOptions } = {}) {
  const app = new OpenAPIHono({ defaultHook: validationHook });
  app.onError(errorHandler);
  if (auth) {
    const own = hosts ?? (() => ownHosts(undefined, `${STUDIO_ALLOWED_HOSTS},${new URL(auth.config.publicUrl).host}`));
    hosts = own;
    app.use('/api/*', writeGuard(hosts)); // before the routes below, logout included
    app.route('/', authRoutes(auth));
    app.use('*', sessionMiddleware(auth));
    app.get('/api/me', (c) => c.json({ username: currentScope()?.user.username, name: currentScope()?.user.name, projects: currentScope()?.projects }));
    // Hosted, the operator sets the bot's settings (environment); a signed-in person does not.
    app.use('/api/settings', async (c, next) => (c.req.method === 'PUT' ? c.json({ error: 'settings are set by the operator of this studio' }, 403) : next()));
  }
  if (!auth) app.use('/api/*', writeGuard(hosts));
  // Local mode has no one signed in: the studio asks and shows no account.
  if (!auth) app.get('/api/me', (c) => c.json({}));
  gitlab ??= scopedGitlab();

  app.use('/api/post', requirePosting);
  app.use('/api/submit-review', requirePosting);
  app.use('/api/drafts/*', requirePosting);

  readRoutes(app);
  writeRoutes(app, gitlab);
  actionRoutes(app);
  replyRoutes(app, gitlab);
  runRoutes(app);
  liveRoutes(app);

  app.doc31('/openapi.json', {
    openapi: '3.1.0',
    info: { title: 'Marginalia studio API', version: '2.0.0', description: DESCRIPTION },
    servers: [{ url: 'http://localhost:4477', description: 'Studio server (`npm start`). In dev the Vite proxy forwards `/api` and `/events` here.' }],
    tags: [{ name: 'Reviews' }, { name: 'Settings' }, { name: 'Pending review' }, { name: 'Triage fixes' }, { name: 'Replies' }, { name: 'Runs' }],
  });

  // Anything else: a write is refused, a read is the app (its own routes live in the browser).
  app.notFound((c) => (c.req.method === 'GET' ? serveStatic(c) : c.json({ error: 'read-only' }, 405)));
  return app;
}
