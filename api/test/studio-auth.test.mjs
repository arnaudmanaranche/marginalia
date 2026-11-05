// The hosted studio: GitLab login, a session per person, their projects only, and a comment posted
// under their own token. GitLab is a fake `fetch`; the routes and middleware are the real ones.
import { test, before } from 'node:test';
import assert from 'node:assert/strict';
import { mkdtemp, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';

const home = await mkdtemp(join(tmpdir(), 'marginalia-auth-'));
Object.assign(process.env, {
  MR_REVIEW_BOT_SKIP_CONFIG_CHECK: '1', MARGINALIA_DB: ':memory:', MARGINALIA_HOME: home,
  GITLAB_BASE_URL: 'https://git.example.com', GITLAB_USERNAME: 'me', GITLAB_TOKEN: 'bot-token', GITLAB_PROJECT_ID: 'group/demo', REPO_LOCAL_PATH: home,
});
delete process.env.ALLOW_POSTING;
const { PROJECTS } = await import('../dist/src/projects.js');
const { createApp } = await import('../dist/src/http/app.js');
const { openDatabase } = await import('../dist/src/db.js');

const key = PROJECTS[0].key;
const PUBLIC = 'https://marginalia.example.com';
const config = { baseUrl: 'https://git.example.com', clientId: 'cid', clientSecret: 'csec', publicUrl: PUBLIC, sessionSecret: 's'.repeat(32), redirectUri: `${PUBLIC}/auth/callback`, secureCookie: true };
let level = 30;
const gitlabCalls = [];
const fetchFn = async (url, init = {}) => {
  const u = String(url);
  const reply = (body, status = 200) => ({ ok: status < 300, status, headers: { get: () => null }, json: async () => body, text: async () => JSON.stringify(body) });
  if (u.endsWith('/oauth/token')) return reply({ access_token: 'user-token', refresh_token: 'r', expires_in: 7200 });
  gitlabCalls.push({ url: u, method: init.method ?? 'GET', auth: init.headers?.Authorization ?? init.headers?.authorization, privateToken: init.headers?.['PRIVATE-TOKEN'] });
  if (u.endsWith('/api/v4/user')) return reply({ username: 'bob', name: 'Bob' });
  if (u.endsWith(`/api/v4/projects/${PROJECTS[0].encodedId}`)) return reply({ permissions: { project_access: { access_level: level } } });
  if (u.includes('/draft_notes') && init.method === 'POST') return reply({ id: 5, note: 'x' }, 201);
  return reply([]);
};
let app;
before(async () => {
  app = createApp({ auth: { config, db: openDatabase(':memory:'), projects: PROJECTS, fetchFn } });
  const mr = { project: key, iid: 7, kind: 'review', title: 'T', web_url: 'https://git.example.com/mr/7', reviewPath: join(PROJECTS[0].reviewsDir, 'feat-x.md') };
  const other = { ...mr, project: 'elsewhere', iid: 8 };
  await writeFile(join(home, 'status.json'), JSON.stringify({ mrs: [mr, other], projects: [{ key }, { key: 'elsewhere' }] }));
});

const HOST = 'marginalia.example.com';
const cookies = (res) => res.headers.getSetCookie().map((c) => c.split(';')[0]).join('; ');
const req = (path, { cookie = '', method = 'GET', body } = {}) => app.request(`${PUBLIC}${path}`, { method, headers: { host: HOST, origin: PUBLIC, cookie, ...(body ? { 'content-type': 'application/json' } : {}) }, ...(body ? { body: JSON.stringify(body) } : {}) });

async function signIn() {
  const login = await req('/auth/login');
  const state = new URL(login.headers.get('location')).searchParams.get('state');
  const back = await req(`/auth/callback?code=abc&state=${state}`, { cookie: cookies(login) });
  return { back, cookie: cookies(back) };
}

test('without a session the api and the live stream answer 401 with where to log in', async () => {
  for (const path of ['/api/me', '/api/reviews', '/events']) {
    const res = await req(path);
    assert.equal(res.status, 401, path);
    assert.equal((await res.json()).login, '/auth/login');
  }
});

test('login goes to GitLab with PKCE, and a callback with the wrong state is refused', async () => {
  const login = await req('/auth/login');
  const url = new URL(login.headers.get('location'));
  assert.equal(url.origin + url.pathname, 'https://git.example.com/oauth/authorize');
  assert.equal(url.searchParams.get('redirect_uri'), `${PUBLIC}/auth/callback`);
  assert.ok(url.searchParams.get('code_challenge'));
  assert.match(login.headers.get('set-cookie'), /HttpOnly/);
  assert.equal((await req('/auth/callback?code=abc&state=wrong', { cookie: cookies(login) })).status, 400);
  assert.equal((await req('/auth/callback?code=abc&state=x')).status, 400);
});

test('a Developer is signed in, sees their projects only, and posts under their own token', async () => {
  level = 30;
  const { back, cookie } = await signIn();
  assert.equal(back.status, 302);
  assert.match(back.headers.get('set-cookie'), /Secure/);
  const me = await (await req('/api/me', { cookie })).json();
  assert.deepEqual(me, { username: 'bob', name: 'Bob', projects: [key] });

  const status = await (await req('/api/status', { cookie })).json();
  assert.deepEqual(status.status.mrs.map((m) => m.project), [key], 'another project\'s MR is not shown');
  assert.equal((await req(`/api/reviews/${encodeURIComponent('elsewhere/feat-x')}`, { cookie })).status, 400);

  gitlabCalls.length = 0;
  const posted = await req('/api/post', { cookie, method: 'POST', body: { slug: `${key}/feat-x`, commentId: 'c1', body: 'use const' } });
  assert.equal(posted.status, 200);
  const draft = gitlabCalls.find((c) => c.method === 'POST' && c.url.includes('/draft_notes'));
  assert.equal(draft.auth, 'Bearer user-token');
  assert.equal(draft.privateToken, undefined, 'the bot token is not used');
});

test('someone below Developer cannot sign in', async () => {
  level = 20;
  const { back } = await signIn();
  assert.equal(back.status, 403);
  level = 30;
});

test('settings stay with the operator, and logging out ends the session', async () => {
  const { cookie } = await signIn();
  assert.equal((await req('/api/settings', { cookie, method: 'PUT', body: { pollIntervalMinutes: 5 } })).status, 403);
  assert.equal((await req('/api/logout', { cookie, method: 'POST', body: {} })).status, 200);
  assert.equal((await req('/api/me', { cookie })).status, 401);
});

test('a write from another origin is refused even with a session', async () => {
  const { cookie } = await signIn();
  const res = await app.request(`${PUBLIC}/api/logout`, { method: 'POST', headers: { host: HOST, origin: 'https://evil.example', cookie, 'content-type': 'application/json' }, body: '{}' });
  assert.equal(res.status, 403);
});
