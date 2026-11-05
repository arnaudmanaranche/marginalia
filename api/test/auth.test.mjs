import { test } from 'node:test';
import assert from 'node:assert/strict';
import { createHash } from 'node:crypto';
import { allowedProjects, authorizeUrl, levelOfProject, pkce, seal, unseal } from '../dist/src/auth.js';
import { exchangeCode, fetchUser, projectLevels, refreshTokens } from '../dist/src/auth-gitlab.js';
import { createSession, deleteSession, purgeSessions, readSession, updateTokens } from '../dist/src/auth-store.js';
import { openDatabase } from '../dist/src/db.js';

test('the PKCE challenge is the digest of its verifier, and the URL carries it', () => {
  const { verifier, challenge } = pkce();
  assert.equal(challenge, createHash('sha256').update(verifier).digest('base64url'));
  const url = new URL(authorizeUrl({ baseUrl: 'https://git.x', clientId: 'id', redirectUri: 'https://m.x/auth/callback', state: 's', challenge }));
  assert.equal(url.pathname, '/oauth/authorize');
  assert.equal(url.searchParams.get('code_challenge'), challenge);
  assert.equal(url.searchParams.get('scope'), 'api');
});

test('a sealed token opens only with the same secret', () => {
  const sealed = seal('glpat-abc', 'secret');
  assert.ok(!sealed.includes('glpat'));
  assert.equal(unseal(sealed, 'secret'), 'glpat-abc');
  assert.equal(unseal(sealed, 'other'), null);
  assert.equal(unseal('garbage', 'secret'), null);
});

test('only Developer and above on a project make it usable', () => {
  assert.deepEqual(allowedProjects({ a: 30, b: 20, c: 50, d: 0 }), ['a', 'c']);
  assert.equal(levelOfProject({ permissions: { project_access: null, group_access: { access_level: 40 } } }), 40);
  assert.equal(levelOfProject(null), 0);
});

const oauth = { baseUrl: 'https://git.x', clientId: 'id', clientSecret: 'sec', redirectUri: 'https://m.x/cb' };
const json = (body, ok = true, status = 200) => async () => ({ ok, status, json: async () => body });

test('the code is exchanged for tokens with its verifier, and a refresh gives new ones', async () => {
  let sent;
  const f = async (url, init) => { sent = { url, body: String(init.body) }; return { ok: true, json: async () => ({ access_token: 'a', refresh_token: 'r', expires_in: 7200 }) }; };
  const t = await exchangeCode(oauth, 'CODE', 'VER', f, 1000);
  assert.deepEqual(t, { accessToken: 'a', refreshToken: 'r', expiresAt: 1000 + 7_200_000 });
  assert.match(sent.body, /grant_type=authorization_code/);
  assert.match(sent.body, /code_verifier=VER/);
  await refreshTokens(oauth, 'r', f, 0);
  assert.match(sent.body, /grant_type=refresh_token/);
  await assert.rejects(exchangeCode(oauth, 'x', 'v', json({}, false, 400)), /refused the login \(400\)/);
});

test('the user and their level on each project come from GitLab with their own token', async () => {
  const f = async (url, init) => {
    assert.equal(init.headers.authorization, 'Bearer tok');
    if (url.endsWith('/user')) return { ok: true, json: async () => ({ username: 'bob', name: 'Bob' }) };
    if (url.endsWith('/projects/1')) return { ok: true, json: async () => ({ permissions: { project_access: { access_level: 30 } } }) };
    return { ok: false, status: 404 };
  };
  assert.deepEqual(await fetchUser('https://git.x', 'tok', f), { username: 'bob', name: 'Bob' });
  assert.deepEqual(await projectLevels('https://git.x', 'tok', [{ key: 'a', encodedId: '1' }, { key: 'b', encodedId: '2' }], f), { a: 30, b: 0 });
});

test('a session is read back with its tokens, expires, and can be updated or deleted', () => {
  const db = openDatabase(':memory:');
  const tokens = { accessToken: 'a', refreshToken: 'r', expiresAt: 5 };
  const id = createSession(db, 's', { username: 'bob', name: 'Bob', projects: ['a'], tokens }, 1000);
  assert.deepEqual(readSession(db, 's', id, 2000), { id, username: 'bob', name: 'Bob', projects: ['a'], tokens });
  updateTokens(db, 's', id, { ...tokens, accessToken: 'b' });
  assert.equal(readSession(db, 's', id, 2000).tokens.accessToken, 'b');
  assert.equal(readSession(db, 'wrong secret', id, 2000), null, 'a session sealed with another secret is dropped');
  const id2 = createSession(db, 's', { username: 'bob', name: 'Bob', projects: [], tokens }, 1000);
  assert.equal(readSession(db, 's', id2, 1000 + 15 * 86_400_000), null, 'expired');
  const id3 = createSession(db, 's', { username: 'bob', name: 'Bob', projects: [], tokens }, 1000);
  purgeSessions(db, 1000 + 15 * 86_400_000);
  assert.equal(readSession(db, 's', id3, 2000), null);
  deleteSession(db, id);
});
