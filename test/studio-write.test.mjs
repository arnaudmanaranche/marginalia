// The studio's write path against an in-memory GitLab: the routes are the real ones, GitLab is
// the second adapter of lib/gitlab-api.mjs's interface.
import { test, before } from 'node:test';
import assert from 'node:assert/strict';
import { mkdtemp, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';

const home = await mkdtemp(join(tmpdir(), 'marginalia-write-'));
Object.assign(process.env, {
  MR_REVIEW_BOT_SKIP_CONFIG_CHECK: '1', MARGINALIA_DB: ':memory:', MARGINALIA_HOME: home, ALLOW_POSTING: 'true',
  GITLAB_BASE_URL: 'https://git.example.com', GITLAB_USERNAME: 'me', GITLAB_TOKEN: 't', GITLAB_PROJECT_ID: 'group/demo', REPO_LOCAL_PATH: home,
});
const { PROJECTS } = await import('../lib/projects.mjs');
const { createApp } = await import('../studio/app.mjs');
const { memoryGitlab } = await import('./support/memory-gitlab.mjs');
const { loadPosted } = await import('../lib/posted.mjs');
const { saveState } = await import('../lib/state.mjs');

const key = PROJECTS[0].key;
const SLUG = `${key}/feat-x`;
const HOST = 'localhost:4477';
let fake;
let app;

before(async () => {
  fake = memoryGitlab({ diffLines: { 'a.js': [2] } });
  app = createApp({ hosts: () => new Set([HOST]), gitlab: fake.gitlab });
  const entry = (iid, kind, name) => ({ project: key, iid, kind, title: 'T', web_url: `https://git.example.com/mr/${iid}`, reviewPath: join(PROJECTS[0].reviewsDir, `${name}.md`) });
  await writeFile(join(home, 'status.json'), JSON.stringify({ mrs: [entry(7, 'review', 'feat-x'), entry(8, 'review', 'feat-z'), entry(9, 'comments', 'feat-y')] }));
});

const post = (path, body) => app.request(`http://${HOST}${path}`, { method: 'POST', headers: { host: HOST, 'content-type': 'application/json' }, body: JSON.stringify(body) });

test('an inline comment becomes a draft on its line, and is recorded once', async () => {
  const res = await post('/api/post', { slug: SLUG, commentId: 'c1', body: 'use const', path: 'a.js', line: 2 });
  assert.equal(res.status, 200);
  assert.equal((await res.json()).inline, true);
  assert.equal(fake.drafts.length, 1);
  assert.equal((await post('/api/post', { slug: SLUG, commentId: 'c1', body: 'use const', path: 'a.js', line: 2 })).status, 409);
});

test('a line outside the diff falls back to a general comment that names the file', async () => {
  const res = await post('/api/post', { slug: SLUG, commentId: 'c2', body: 'rename this', path: 'a.js', line: 99 });
  assert.equal(res.status, 200);
  const info = await res.json();
  assert.equal(info.inline, false);
  assert.match(fake.drafts.at(-1).note, /^`a\.js:99`\n\nrename this/);
});

test('submitting publishes the drafts as one review and approves', async () => {
  const res = await post('/api/submit-review', { slug: SLUG, action: 'approve', summary: 'Looks good' });
  assert.equal(res.status, 200);
  assert.deepEqual((await res.json()), { submitted: 2, summary: true, action: 'approve' });
  assert.equal(fake.drafts.length, 0);
  assert.equal(fake.reviews.at(-1).drafts, 3);
  assert.deepEqual(fake.approvedBy, ['me']);
  const posted = Object.values(await loadPosted());
  assert.ok(posted.every((p) => p.state === 'published' && /#note_\d+$/.test(p.url)));
});

test('an unknown review id is refused', async () => {
  assert.equal((await post('/api/submit-review', { slug: `${key}/nope`, action: 'comment' })).status, 404);
});

test('an approval refused because the head moved still reports the published comments', async () => {
  await saveState(PROJECTS[0], { 8: 'stale', mineComments: {}, stackBelow: {} });
  await post('/api/post', { slug: `${key}/feat-z`, commentId: 'c1', body: 'one thing' });
  const res = await post('/api/submit-review', { slug: `${key}/feat-z`, action: 'approve' });
  assert.equal(res.status, 502);
  assert.match((await res.json()).error, /^Comments published, but the approval failed/);
  assert.equal(fake.drafts.length, 0);
  assert.deepEqual(fake.approvedBy, ['me']);
});

test('on my own MR a reply goes up as a draft in the reviewer thread, once', async () => {
  const threadId = fake.seedThread({ body: 'why not a map?', path: 'a.js', line: 2 });
  const body = { slug: `${key}/feat-y`, threadId, body: 'Fixed.', resolve: true };
  const res = await post('/api/replies', body);
  assert.equal(res.status, 200);
  assert.equal(fake.drafts.at(-1).in_reply_to_discussion_id, threadId);
  assert.equal((await post('/api/replies', body)).status, 409);
  assert.equal((await post('/api/replies', { ...body, threadId: 'deadbeefdeadbeef', slug: `${key}/feat-y` })).status, 404);
});

test('where an MR stands is read through the adapter, with the optional reads failing soft', async () => {
  const { fetchReviewState } = await import('../lib/mr-state.mjs');
  const broken = { ...fake.gitlab, listReviewers: async () => { throw new Error('boom'); }, getApprovals: async () => { throw new Error('boom'); } };
  const state = await fetchReviewState(PROJECTS[0], { iid: 7, author: 'alice' }, broken);
  assert.ok(state.computedAt);
});
