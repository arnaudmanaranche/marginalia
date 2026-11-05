// Local review reader: the JSON API (see app.ts and the routes-*.ts files) over each
// project's reviews dir + status.json, live updates over SSE, and the built React app
// (studio/dist) as static files. Bound to 127.0.0.1 only; read-only apart from
// PUT /api/settings, POST /api/rerun, the posting routes (on other people's MRs only when
// ALLOW_POSTING=true), and on my own MRs the replies to reviewers and POST /api/push.
import { mkdirSync, watch, type FSWatcher } from 'node:fs';
import { dirname } from 'node:path';
import { serve } from '@hono/node-server';
import { GITLAB_BASE_URL, STATUS_FILE, STUDIO_HOST, STUDIO_PORT } from '../config.ts';
import { readAuthConfig } from '../auth-config.ts';
import { purgeSessions } from '../auth-store.ts';
import { getDb } from '../store.ts';
import { PROJECTS } from '../projects.ts';
import { RUNS_DIR } from '../run-journal.ts';
import { logger } from '../logger.ts';
import { createApp } from './app.ts';
import { broadcast } from './context.ts';
import { endLiveStreams } from './routes-live.ts';

export function startStudio() {
  const login = readAuthConfig(process.env, GITLAB_BASE_URL);
  if (!login.ok) throw new Error(login.error);
  if (login.config) purgeSessions(getDb());
  const auth = login.config ? { config: login.config, db: getDb(), projects: PROJECTS } : undefined;
  const server = serve({ fetch: createApp({ auth }).fetch, port: Number(STUDIO_PORT), hostname: STUDIO_HOST }, () => {
    logger.info(login.config ? `Studio: ${login.config.publicUrl} (GitLab login)` : `Studio: http://localhost:${STUDIO_PORT}`);
    // Without login, anyone who can reach the port can read the reviews and, when posting is on, post as you.
    if (!login.config && !['127.0.0.1', 'localhost', '::1'].includes(STUDIO_HOST)) logger.warn(`Studio listens on ${STUDIO_HOST} with no login: publish the port on 127.0.0.1 only, or keep it on a private network.`);
  });
  server.on('error', (err) => logger.error(err.code === 'EADDRINUSE' ? `Studio: port ${STUDIO_PORT} already in use` : `Studio: ${err.message}`));
  const watchers: FSWatcher[] = [];
  for (const project of PROJECTS) {
    try {
      watchers.push(watch(project.reviewsDir, broadcast));
    } catch {
      /* dir may not exist yet; the poller creates it, SSE just stays quiet */
    }
  }
  // Watch the directory, not the files: status.json and settings.json are
  // written via tmp + rename, which leaves a file-level watcher on the old inode.
  try {
    watchers.push(watch(dirname(STATUS_FILE), (_e, name) => (name === 'settings.json' || name === 'status.json') && broadcast()));
  } catch {
    /* same */
  }
  // A run's trace and the doctor's diagnosis move on their own, between two status writes.
  try {
    mkdirSync(RUNS_DIR, { recursive: true });
    watchers.push(watch(RUNS_DIR, { recursive: true }, (_e, name) => !/\.(tmp|jsonl)$/.test(String(name)) && broadcast()));
  } catch {
    /* no recursive watch here: runs still refresh on each status write */
  }
  server.on('close', () => {
    for (const w of watchers) w.close();
    endLiveStreams();
  });
  return server;
}

if (import.meta.url === `file://${process.argv[1]}`) startStudio();
