import { levelOfProject } from './auth.ts';

// What the login asks of GitLab: the token exchange and refresh, who the token belongs to, and
// the person's access level on each watched project. `fetchFn` is injected so a test hands it a fake.
export interface Tokens { accessToken: string; refreshToken: string; expiresAt: number }
type Fetch = typeof fetch;
type Oauth = { baseUrl: string; clientId: string; clientSecret: string; redirectUri: string };

async function tokenRequest(o: Oauth, params: Record<string, string>, fetchFn: Fetch, now: number): Promise<Tokens> {
  const res = await fetchFn(`${o.baseUrl}/oauth/token`, {
    method: 'POST',
    headers: { 'content-type': 'application/x-www-form-urlencoded' },
    body: new URLSearchParams({ client_id: o.clientId, client_secret: o.clientSecret, redirect_uri: o.redirectUri, ...params }),
  });
  if (!res.ok) throw new Error(`GitLab refused the login (${res.status})`);
  const t: any = await res.json();
  if (!t.access_token || !t.refresh_token) throw new Error('GitLab sent no token');
  return { accessToken: t.access_token, refreshToken: t.refresh_token, expiresAt: now + Number(t.expires_in ?? 7200) * 1000 };
}

export const exchangeCode = (o: Oauth, code: string, verifier: string, fetchFn: Fetch = fetch, now = Date.now()) =>
  tokenRequest(o, { grant_type: 'authorization_code', code, code_verifier: verifier }, fetchFn, now);
export const refreshTokens = (o: Oauth, refreshToken: string, fetchFn: Fetch = fetch, now = Date.now()) =>
  tokenRequest(o, { grant_type: 'refresh_token', refresh_token: refreshToken }, fetchFn, now);

const get = async (baseUrl: string, token: string, path: string, fetchFn: Fetch) => {
  const res = await fetchFn(`${baseUrl}/api/v4${path}`, { headers: { authorization: `Bearer ${token}` } });
  return res.ok ? res.json() : null;
};

export async function fetchUser(baseUrl: string, token: string, fetchFn: Fetch = fetch): Promise<{ username: string; name: string } | null> {
  const u: any = await get(baseUrl, token, '/user', fetchFn);
  return u?.username ? { username: u.username, name: u.name ?? u.username } : null;
}

// Access level per project key (0 when GitLab shows the person nothing of it).
export async function projectLevels(baseUrl: string, token: string, projects: { key: string; encodedId: string }[], fetchFn: Fetch = fetch): Promise<Record<string, number>> {
  const entries = await Promise.all(projects.map(async (p) => [p.key, levelOfProject(await get(baseUrl, token, `/projects/${p.encodedId}`, fetchFn))] as const));
  return Object.fromEntries(entries);
}
