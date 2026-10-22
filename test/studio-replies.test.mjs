// On my own MR (a triage) I answer the reviewers without any switch; on someone else's MR the
// replies route is refused and posting stays behind ALLOW_POSTING. Nothing here reaches GitLab.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { mkdtemp, writeFile, mkdir } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';

const dir = await mkdtemp(join(tmpdir(), 'marginalia-replies-'));
Object.assign(process.env, {
  MR_REVIEW_BOT_SKIP_CONFIG_CHECK: '1', MARGINALIA_DB: ':memory:', STUDIO_PORT: '4477', ALLOW_POSTING: 'false',
  GITLAB_BASE_URL: 'https://git.example.com', GITLAB_USERNAME: 'me', GITLAB_TOKEN: 't', GITLAB_PROJECT_ID: 'group/demo',
  REPO_LOCAL_PATH: dir, MARGINALIA_HOME: dir,
});
const { createApp } = await import('../studio/app.mjs');
const { PROJECTS } = await import('../lib/projects.mjs');
const { savePosted } = await import('../lib/posted.mjs');
const { reviewsDir } = PROJECTS[0];
await mkdir(reviewsDir, { recursive: true });
const tracked = (iid, kind, file) => ({ project: 'demo', iid, kind, reviewPath: join(reviewsDir, `${file}.md`), web_url: `https://git.example.com/group/demo/-/merge_requests/${iid}`, source_branch: 'x' });
await writeFile(join(dir, 'status.json'), JSON.stringify({ pid: 1, phase: 'idle', mrs: [tracked(1, 'comments', 'mr-comments-mine'), tracked(2, 'review', 'theirs')] }));
const app = createApp();

const send = (method, path, body) => app.request(path, { method, headers: { host: 'localhost:4477', 'content-type': 'application/json' }, body: JSON.stringify(body) });
const errorOf = async (res) => (await res.json()).error;
const THREAD = 'abcdef0123456789';
const reply = { slug: 'demo/mr-comments-mine', threadId: THREAD, body: 'Fixed, thanks.' };

test('a reply needs a thread id and text', async () => {
  assert.equal((await send('POST', '/api/replies', { ...reply, threadId: '../x' })).status, 400);
  assert.equal((await send('POST', '/api/replies', { ...reply, body: ' ' })).status, 400);
});

test('replies are only for my own MR', async () => {
  const res = await send('POST', '/api/replies', { ...reply, slug: 'demo/theirs' });
  assert.equal(res.status, 403);
  assert.match(await errorOf(res), /your own/);
  assert.equal((await send('POST', '/api/replies', { ...reply, slug: 'demo/untracked' })).status, 404);
});

test('the fixes of a triage are read from their own route, not answered with the app', async () => {
  const res = await app.request('/api/fixes/demo%2Ftheirs');
  assert.equal(res.status, 404);
  assert.match(await errorOf(res), /no tracked triage/);
});

test('a thread gets one reply', async () => {
  await savePosted({ [`demo/mr-comments-mine:reply-${THREAD}`]: { at: 'now', iid: 1, url: 'u', state: 'draft', draftId: 5 } });
  assert.equal((await send('POST', '/api/replies', reply)).status, 409);
  await savePosted({});
});

test('submitting is open on my own MR without ALLOW_POSTING, and still closed on someone else\'s', async () => {
  const mine = await send('POST', '/api/submit-review', { slug: 'demo/mr-comments-mine' });
  assert.equal(mine.status, 400, 'past the switch: refused only because there is nothing to submit');
  assert.match(await errorOf(mine), /nothing to submit/);
  const theirs = await send('POST', '/api/submit-review', { slug: 'demo/theirs' });
  assert.equal(theirs.status, 403);
  assert.match(await errorOf(theirs), /ALLOW_POSTING/);
});
