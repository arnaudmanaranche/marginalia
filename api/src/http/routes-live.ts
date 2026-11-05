import { readFile } from 'node:fs/promises';
import { join, extname, normalize } from 'node:path';
import { streamSSE } from 'hono/streaming';
import { subscribe } from './context.ts';
import { uiDist, uiDistCandidates } from '../ui-assets.ts';

const DIST = uiDist() ?? uiDistCandidates()[1];
const MIME: Record<string, string> = {
  '.html': 'text/html; charset=utf-8',
  '.js': 'text/javascript; charset=utf-8',
  '.css': 'text/css; charset=utf-8',
  '.svg': 'image/svg+xml',
  '.json': 'application/json; charset=utf-8',
  '.woff2': 'font/woff2',
  '.ico': 'image/x-icon',
};

// The built React app (ui/dist); the SPA's index for any path that is not a file, and a
// plain notice when the app isn't built yet.
export async function serveStatic(c: any) {
  const rel = normalize(c.req.path === '/' ? '/index.html' : c.req.path);
  const file = join(DIST, rel);
  if (!file.startsWith(DIST)) return c.json({ error: 'bad path' }, 400);
  try {
    return c.body(await readFile(file), 200, { 'content-type': MIME[extname(file)] ?? 'application/octet-stream' });
  } catch {
    try {
      return c.body(await readFile(join(DIST, 'index.html')), 200, { 'content-type': MIME['.html'] });
    } catch {
      return c.text('Studio not built: run `npm run studio:build`.', 503);
    }
  }
}

// Server-sent events: one "changed" per update, and the page loads again what it shows.
// Ended with the server, so it can be stopped cleanly (tests start and stop it).
const open = new Set<() => void>();
export const endLiveStreams = () => {
  for (const end of open) end();
};

export function liveRoutes(app: any) {
  app.get('/events', (c: any) => {
    c.header('cache-control', 'no-store');
    return streamSSE(c, async (stream) => {
      await stream.write('retry: 3000\n\n');
      const unsubscribe = subscribe(() => void stream.write('data: changed\n\n'));
      await new Promise((resolve) => {
        const end = () => {
          open.delete(end);
          unsubscribe();
          resolve(undefined);
        };
        open.add(end);
        stream.onAbort(end);
      });
    });
  });
}
