// With posting switched on, the routes validate what they are given and resolve the MR from the
// bot's status, never from the request. Nothing here reaches GitLab: every case stops before.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { mkdtemp, writeFile, mkdir } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';

const dir = await mkdtemp(join(tmpdir(), 'marginalia-posting-'));
Object.assign(process.env, {
  MR_REVIEW_BOT_SKIP_CONFIG_CHECK: '1', MARGINALIA_DB: ':memory:', STUDIO_PORT: '4477', ALLOW_POSTING: 'true',
  GITLAB_BASE_URL: 'https://git.example.com', GITLAB_USERNAME: 'me', GITLAB_TOKEN: 't', GITLAB_PROJECT_ID: 'group/demo',
  REPO_LOCAL_PATH: dir, MARGINALIA_HOME: dir,
});
const { createApp } = await import('../api/src/http/app.mjs');
const { PROJECTS } = await import('../api/src/projects.mjs');
await mkdir(PROJECTS[0].reviewsDir, { recursive: true });
await writeFile(join(dir, 'status.json'), JSON.stringify({ pid: 1, phase: 'idle', mrs: [] }));
const app = createApp();

const OWN = { host: 'localhost:4477', 'content-type': 'application/json' };
const send = (method, path, body) => app.request(path, { method, headers: OWN, body: body === undefined ? undefined : JSON.stringify(body) });
const errorOf = async (res) => (await res.json()).error;
const good = { slug: 'demo/feat-x', commentId: 'c1', body: 'Please rename this.' };

test('a comment needs a review id, a comment id and a non-empty body', async () => {
  for (const [bad, expected] of [[{ ...good, slug: 'feat-x' }, /slug/], [{ ...good, commentId: 'a b' }, /commentId/], [{ ...good, body: '   ' }, /body/], [{ ...good, line: 3 }, /path/], [{ ...good, path: 'a.ts', line: 0 }, /line/]]) {
    const res = await send('POST', '/api/post', bad);
    assert.equal(res.status, 400, JSON.stringify(bad));
    assert.match(await errorOf(res), expected);
  }
});

test('a well-formed comment on a review the bot does not track is a 404, not a post', async () => {
  const res = await send('POST', '/api/post', good);
  assert.equal(res.status, 404);
  assert.match(await errorOf(res), /no tracked merge request/);
});

test('an unknown project in the id is refused before anything is looked up', async () => {
  assert.equal((await send('POST', '/api/submit-review', { slug: 'other/feat-x' })).status, 404);
  assert.equal((await send('POST', '/api/rerun', { slug: 'demo/feat-x' })).status, 404);
  assert.equal((await send('POST', '/api/push', { slug: 'demo/feat-x' })).status, 404);
  assert.equal((await send('DELETE', '/api/drafts/demo%2Ffeat-x/12')).status, 404);
});

test('submitting needs a known action, and a draft edit needs text', async () => {
  const action = await send('POST', '/api/submit-review', { slug: 'demo/feat-x', action: 'merge' });
  assert.equal(action.status, 400);
  assert.match(await errorOf(action), /action/);
  assert.equal((await send('PUT', '/api/drafts/demo%2Ffeat-x/12', { body: '  ' })).status, 400);
  assert.equal((await send('PUT', '/api/drafts/demo%2Ffeat-x/abc', { body: 'x' })).status, 400);
});

test('a chat question needs a stop id and a question', async () => {
  assert.equal((await send('POST', '/api/chat', { slug: 'demo/feat-x', stopId: '../x', question: 'why?' })).status, 400);
  assert.equal((await send('POST', '/api/chat', { slug: 'demo/feat-x', stopId: 'stop-1', question: ' ' })).status, 400);
});
