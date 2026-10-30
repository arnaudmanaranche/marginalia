import { Hono } from 'hono';
import { deleteCookie, getCookie, setCookie } from 'hono/cookie';
import { timingSafeEqual } from 'node:crypto';
import { LOGIN_COOKIE, SESSION_COOKIE, SESSION_DAYS, allowedProjects, authorizeUrl, pkce, randomToken, seal, unseal } from '../auth.ts';
import { exchangeCode, fetchUser, projectLevels } from '../auth-gitlab.ts';
import { createSession, deleteSession } from '../auth-store.ts';
import type { AuthConfig } from '../auth-config.ts';

// /auth/login sends the person to GitLab, /auth/callback turns the answer into a session,
// /api/logout ends it (under /api, so the same-origin guard of writes applies).
export function authRoutes({ config, db, projects, fetchFn = fetch }: { config: AuthConfig; db: any; projects: { key: string; encodedId: string }[]; fetchFn?: typeof fetch }) {
  const cookie = { httpOnly: true, secure: config.secureCookie, sameSite: 'Lax' as const, path: '/' };
  const app = new Hono();

  app.get('/auth/login', (c) => {
    const state = randomToken();
    const { verifier, challenge } = pkce();
    setCookie(c, LOGIN_COOKIE, seal(JSON.stringify({ state, verifier }), config.sessionSecret), { ...cookie, maxAge: 600 });
    return c.redirect(authorizeUrl({ baseUrl: config.baseUrl, clientId: config.clientId, redirectUri: config.redirectUri, state, challenge }));
  });

  app.get('/auth/callback', async (c) => {
    const sealed = getCookie(c, LOGIN_COOKIE);
    deleteCookie(c, LOGIN_COOKIE, { path: '/' });
    const login = sealed ? unseal(sealed, config.sessionSecret) : null;
    const { state, verifier } = login ? JSON.parse(login) : ({} as Record<string, string>);
    const given = Buffer.from(c.req.query('state') ?? '');
    const wanted = Buffer.from(state ?? '');
    if (!state || given.length !== wanted.length || !timingSafeEqual(given, wanted) || !c.req.query('code')) return c.text('The login expired or was tampered with: start again.', 400);
    try {
      const tokens = await exchangeCode(config, c.req.query('code') as string, verifier, fetchFn);
      const user = await fetchUser(config.baseUrl, tokens.accessToken, fetchFn);
      if (!user) return c.text('GitLab did not say who you are.', 502);
      const usable = allowedProjects(await projectLevels(config.baseUrl, tokens.accessToken, projects, fetchFn));
      if (!usable.length) return c.text('You are not a Developer on any project this studio watches.', 403);
      const id = createSession(db, config.sessionSecret, { ...user, projects: usable, tokens });
      setCookie(c, SESSION_COOKIE, id, { ...cookie, maxAge: SESSION_DAYS * 86_400 });
      return c.redirect('/');
    } catch (err) {
      return c.text(String((err as Error).message).slice(0, 200), 502);
    }
  });

  app.post('/api/logout', (c) => {
    const id = getCookie(c, SESSION_COOKIE);
    if (id) deleteSession(db, id);
    deleteCookie(c, SESSION_COOKIE, { path: '/' });
    return c.json({ ok: true });
  });
  return app;
}
