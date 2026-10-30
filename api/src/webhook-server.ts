import { serve } from '@hono/node-server';
import { Hono } from 'hono';
import { bodyLimit } from 'hono/body-limit';
import { logger } from './logger.ts';
import { parseNoteHook, tokenMatches, type NoteEvent } from './webhook.ts';

// The webhook listener: its own port, one route. The token is checked before anything is read,
// a hook that is not a Note Hook is acknowledged and dropped, and the answer is sent at once:
// the work is queued, never awaited, so GitLab does not time out and disable the hook.
export function createWebhookApp({ secret, onNote }: { secret: string; onNote: (ev: NoteEvent) => Promise<unknown> }) {
  const app = new Hono();
  app.post('/webhooks/gitlab', bodyLimit({ maxSize: 1024 * 1024, onError: (c) => c.text('too large', 413) }), async (c) => {
    if (!tokenMatches(c.req.header('x-gitlab-token'), secret)) return c.text('unauthorized', 401);
    if (c.req.header('x-gitlab-event') !== 'Note Hook') return c.text('ignored', 200);
    const payload = await c.req.json().catch(() => null);
    if (!payload) return c.text('bad request', 400);
    const ev = parseNoteHook(payload);
    if (ev) void onNote(ev).catch((err) => logger.error({ err, noteId: ev.noteId }, 'A webhook note could not be handled'));
    return c.text('ok', 200);
  });
  return app;
}

export function startWebhook({ secret, port, host, onNote }: { secret: string; port: number; host: string; onNote: (ev: NoteEvent) => Promise<unknown> }) {
  const server = serve({ fetch: createWebhookApp({ secret, onNote }).fetch, port, hostname: host }, () => logger.info(`Webhook: ${host}:${port}/webhooks/gitlab`));
  server.on('error', (err: NodeJS.ErrnoException) => logger.error(err.code === 'EADDRINUSE' ? `Webhook: port ${port} already in use` : `Webhook: ${err.message}`));
  return server;
}
