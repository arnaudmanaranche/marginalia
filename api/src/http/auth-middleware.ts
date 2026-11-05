import { getCookie } from 'hono/cookie';
import { REFRESH_MARGIN_MS, SESSION_COOKIE } from '../auth.ts';
import { refreshTokens } from '../auth-gitlab.ts';
import { deleteSession, readSession, updateTokens } from '../auth-store.ts';
import type { AuthConfig } from '../auth-config.ts';
import { gitlabForUser } from '../gitlab-api.ts';
import { runInScope } from './request-scope.ts';

// Everything under /api and /events needs a session; the signed-in person's token is refreshed
// when it is about to end, and the request then runs in their scope (request-scope.ts).
// The login and logout routes, and the app shell, stay open.
const OPEN = new Set(['/api/logout']);

export function sessionMiddleware({ config, db, fetchFn = fetch, now = () => Date.now() }: { config: AuthConfig; db: any; fetchFn?: typeof fetch; now?: () => number }) {
  return async (c: any, next: any) => {
    const path = c.req.path;
    if (OPEN.has(path) || !(path.startsWith('/api/') || path === '/events')) return next();
    const id = getCookie(c, SESSION_COOKIE);
    const session = id ? readSession(db, config.sessionSecret, id, now()) : null;
    if (!id || !session) return c.json({ error: 'login required', login: '/auth/login' }, 401);
    let { tokens } = session;
    if (tokens.expiresAt - now() < REFRESH_MARGIN_MS) {
      try {
        tokens = await refreshTokens(config, tokens.refreshToken, fetchFn, now());
        updateTokens(db, config.sessionSecret, id, tokens);
      } catch {
        deleteSession(db, id);
        return c.json({ error: 'login required', login: '/auth/login' }, 401);
      }
    }
    const gitlab = gitlabForUser({ baseUrl: config.baseUrl, token: tokens.accessToken, username: session.username, fetchFn });
    return runInScope({ user: { username: session.username, name: session.name }, projects: session.projects, gitlab }, next);
  };
}
