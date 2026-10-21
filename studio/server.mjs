// Local review reader: the JSON API (see app.mjs and the routes-*.mjs files) over each
// project's reviews dir + status.json, live updates over SSE, and the built React app
// (studio/dist) as static files. Bound to 127.0.0.1 only; read-only apart from
// PUT /api/settings and, when ALLOW_POSTING=true, the posting routes (comment on the MR,
// after confirmation), POST /api/rerun and, when ALLOW_PUSH=true, POST /api/push.
import { watch } from 'node:fs';
import { dirname } from 'node:path';
import { serve } from '@hono/node-server';
import { STATUS_FILE, STUDIO_PORT } from '../lib/config.mjs';
import { PROJECTS } from '../lib/projects.mjs';
import { createApp } from './app.mjs';
import { broadcast } from './context.mjs';
import { endLiveStreams } from './routes-live.mjs';

export function startStudio() {
  const server = serve({ fetch: createApp().fetch, port: Number(STUDIO_PORT), hostname: '127.0.0.1' }, () => {
    console.log(`[studio] http://localhost:${STUDIO_PORT}`);
  });
  server.on('error', (err) => console.error(`[studio] ${err.code === 'EADDRINUSE' ? `port ${STUDIO_PORT} already in use` : err.message}`));
  const watchers = [];
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
  server.on('close', () => {
    for (const w of watchers) w.close();
    endLiveStreams();
  });
  return server;
}

if (import.meta.url === `file://${process.argv[1]}`) startStudio();
