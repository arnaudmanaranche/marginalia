// @ts-check
import { HTTPException } from 'hono/http-exception';
import { bodyLimit } from 'hono/body-limit';
import { STUDIO_PORT, STUDIO_ALLOWED_HOSTS, ALLOW_POSTING, ALLOW_PUSH } from '../lib/config.mjs';

// Write endpoints are guarded against other web pages hitting localhost: Host must be us
// (DNS rebinding), Origin must be us when present, and a body must be JSON (a cross-origin
// JSON request needs a CORS preflight we don't answer).
const forbidden = (c) => c.json({ error: 'forbidden' }, 403);

// Resolved per request: the port is only known once a test binds port 0.
export function ownHosts(port = STUDIO_PORT, extra = STUDIO_ALLOWED_HOSTS) {
  const more = String(extra).split(',').map((h) => h.trim()).filter(Boolean);
  return new Set([`localhost:${port}`, `127.0.0.1:${port}`, ...more]);
}

export function writeGuard(hosts = ownHosts) {
  const tooLarge = bodyLimit({ maxSize: 20_000, onError: (c) => c.json({ error: 'too large' }, 413) });
  return async (c, next) => {
    if (c.req.method === 'GET' || c.req.method === 'HEAD') return next();
    const own = hosts();
    const origin = c.req.header('origin');
    if (!own.has(c.req.header('host') ?? '') || (origin && !own.has(origin.replace(/^https?:\/\//, '')))) return forbidden(c);
    if ((c.req.method === 'POST' || c.req.method === 'PUT') && !String(c.req.header('content-type') ?? '').startsWith('application/json')) {
      return c.json({ error: 'expected application/json' }, 415);
    }
    return tooLarge(c, next);
  };
}

export const requirePosting = async (c, next) => (ALLOW_POSTING === 'true' ? next() : c.json({ error: 'posting is disabled (ALLOW_POSTING=false)' }, 403));
export const requirePush = async (c, next) => (ALLOW_PUSH === 'true' ? next() : c.json({ error: 'pushing is disabled (ALLOW_PUSH=false)' }, 403));

// Bad input answers { error } (400), whatever library found it.
export const validationHook = (result, c) => {
  if (result.success) return undefined;
  const issue = result.error.issues?.[0];
  const where = issue?.path?.length ? `${issue.path.join('.')}: ` : '';
  return c.json({ error: `${where}${issue?.message ?? 'invalid input'}` }, 400);
};

export function errorHandler(err, c) {
  if (err instanceof HTTPException) return c.json({ error: err.message }, err.status);
  return c.json({ error: String(err.message ?? err) }, 500);
}
