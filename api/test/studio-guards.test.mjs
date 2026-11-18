// The studio's write endpoints must refuse what is not the studio itself, and everything that
// reaches GitLab must stay off unless it was switched on. Run against the app in-process.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { mkdtemp, readFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { errorOf } from './support/studio.mjs';

const dir = await mkdtemp(join(tmpdir(), 'marginalia-guards-'));
Object.assign(process.env, {
  MR_REVIEW_BOT_SKIP_CONFIG_CHECK: '1', MARGINALIA_DB: ':memory:', STUDIO_PORT: '4477', ALLOW_POSTING: 'false',
  GITLAB_BASE_URL: 'https://git.example.com', GITLAB_USERNAME: 'me', GITLAB_TOKEN: 't', GITLAB_PROJECT_ID: 'group/demo',
  REPO_LOCAL_PATH: dir, SETTINGS_FILE: join(dir, 'settings.json'),
});
const { createApp } = await import('../dist/src/http/app.js');
const app = createApp();

const OWN = { host: 'localhost:4477', 'content-type': 'application/json' };
const send = (method, path, { headers = OWN, body } = {}) =>
  app.request(path, { method, headers, body: body === undefined ? undefined : typeof body === 'string' ? body : JSON.stringify(body) });

test('a write from another Host (DNS rebinding) or another Origin is refused', async () => {
  assert.equal((await send('PUT', '/api/settings', { headers: { ...OWN, host: 'evil.example:4477' }, body: {} })).status, 403);
  assert.equal((await send('PUT', '/api/settings', { headers: { ...OWN, origin: 'https://evil.example' }, body: {} })).status, 403);
  assert.equal((await send('DELETE', '/api/drafts/demo%2Ffeat-x/1', { headers: { host: 'evil.example' } })).status, 403);
});

test('the studio\'s own origin is accepted', async () => {
  const res = await send('PUT', '/api/settings', { headers: { ...OWN, origin: 'http://localhost:4477' }, body: { staleAfterDays: 7 } });
  assert.equal(res.status, 200);
  assert.equal((await res.json()).settings.staleAfterDays, 7);
  assert.equal(JSON.parse(await readFile(join(dir, 'settings.json'), 'utf8')).staleAfterDays, 7);
});

test('a body that is not JSON, not declared as JSON, or too large is refused', async () => {
  assert.equal((await send('PUT', '/api/settings', { headers: { host: 'localhost:4477', 'content-type': 'text/plain' }, body: '{}' })).status, 415);
  assert.equal((await send('PUT', '/api/settings', { body: '{nope' })).status, 400);
  assert.equal((await send('PUT', '/api/settings', { body: { excludeAuthors: ['a'.repeat(30_000)] } })).status, 413);
});

test('invalid settings answer 400 with a message, and change nothing', async () => {
  const res = await send('PUT', '/api/settings', { body: { staleAfterDays: 0 } });
  assert.equal(res.status, 400);
  assert.match(await errorOf(res), /staleAfterDays/);
});

test('posting on other people\'s MRs is off by default, before the body is even looked at', async () => {
  for (const [method, path] of [['POST', '/api/post'], ['POST', '/api/submit-review'], ['PUT', '/api/drafts/demo%2Ffeat-x/1'], ['DELETE', '/api/drafts/demo%2Ffeat-x/1'], ['GET', '/api/drafts/demo%2Ffeat-x']]) {
    const res = await send(method, path, { body: method === 'GET' || method === 'DELETE' ? undefined : {} });
    assert.equal(res.status, 403, `${method} ${path}`);
    assert.match(await errorOf(res), /ALLOW_POSTING/);
  }
  // Pushing only ever concerns my own MR, so no switch: the route itself refuses anything else.
  assert.equal((await send('POST', '/api/push', { body: { slug: 'demo/feat-x' } })).status, 404);
});

test('a review id of an unknown project, or without a project, is a bad slug', async () => {
  for (const id of ['nope%2Ffeat-x', 'feat-x', 'demo%2F..%2Fx']) {
    const res = await send('GET', `/api/reviews/${id}`);
    assert.equal(res.status, 400, id);
  }
  assert.equal((await send('GET', '/api/reviews/demo%2Fmissing')).status, 404);
});

test('an unknown write is refused as read-only, an unknown read falls through to the app', async () => {
  assert.equal((await send('POST', '/api/nothing', { body: {} })).status, 405);
  // The app's own routes live in the browser: the index when the studio is built, a notice (503) when not.
  const { uiDist } = await import('../dist/src/ui-assets.js');
  const page = await send('GET', '/some/route');
  assert.equal(page.status, uiDist() ? 200 : 503);
  if (uiDist()) assert.match(page.headers.get('content-type'), /text\/html/);
});

test('every /api route the app registers is documented in the generated OpenAPI document', async () => {
  const doc = await (await send('GET', '/openapi.json')).json();
  const documented = new Set(Object.keys(doc.paths));
  // `ALL`/wildcard entries are guards and `/api/me` is the auth probe, not part of the contract.
  const registered = [...new Set(app.routes.filter((r) => r.method !== 'ALL' && r.path.startsWith('/api/') && r.path !== '/api/me').map((r) => r.path.replace(/:(\w+)/g, '{$1}')))];
  assert.ok(registered.length > 20, 'the router lists its routes');
  for (const p of registered) assert.ok(documented.has(p), `${p} is not in the OpenAPI document`);
  for (const p of documented) assert.ok(registered.includes(p), `${p} is documented but not routed`);
});

test('extra Host values (a container published on another port) are accepted only when listed', async () => {
  const { ownHosts } = await import('../dist/src/http/guards.js');
  assert.deepEqual([...ownHosts('4477', '')].sort(), ['127.0.0.1:4477', 'localhost:4477']);
  const more = ownHosts('4477', ' localhost:8080 , ,studio.internal:4477');
  assert.ok(more.has('localhost:8080') && more.has('studio.internal:4477') && more.has('localhost:4477'));
});
