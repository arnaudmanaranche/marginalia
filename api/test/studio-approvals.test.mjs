// The approvals inbox: what is proposed and not decided, and saying no. Nothing reaches GitLab.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { mkdtemp, mkdir, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';

const dir = await mkdtemp(join(tmpdir(), 'marginalia-approvals-'));
Object.assign(process.env, {
  MR_REVIEW_BOT_SKIP_CONFIG_CHECK: '1', MARGINALIA_DB: ':memory:', STUDIO_PORT: '4477', ALLOW_POSTING: 'false',
  GITLAB_BASE_URL: 'https://git.example.com', GITLAB_USERNAME: 'me', GITLAB_TOKEN: 't', GITLAB_PROJECT_ID: 'group/demo',
  REPO_LOCAL_PATH: dir, MARGINALIA_HOME: dir,
});
const { createApp } = await import('../dist/src/http/app.js');
const { PROJECTS } = await import('../dist/src/projects.js');
const reviews = PROJECTS[0].reviewsDir;
await mkdir(reviews, { recursive: true });
const finding = (id, comment) => ({ id, severity: 'important', title: `Title ${id}`, path: 'src/a.ts', line: 3, body: 'Why.', comment });
const shape = (findings) => JSON.stringify({ version: 1, source: 'json', verdict: 'REQUEST_CHANGES', summary: 's', findings, criticalPaths: ['Payment'], warnings: [], generatedAt: '2026-11-05T10:00:00Z' });
await writeFile(join(reviews, 'feat-x.md'), '# x');
await writeFile(join(reviews, 'feat-x.findings.json'), shape([finding('a', 'Please guard the null.'), finding('b', null)]));
await writeFile(join(reviews, 'own-feat-y.md'), '# y');
await writeFile(join(reviews, 'own-feat-y.findings.json'), shape([finding('c', 'Mine.')]));
await writeFile(join(dir, 'status.json'), JSON.stringify({ pid: 1, phase: 'idle', mrs: [
  { project: 'demo', iid: 5, kind: 'review', title: 'Add coupons', reviewPath: join(reviews, 'feat-x.md'), status: 'up_to_date' },
  { project: 'demo', iid: 6, kind: 'own', title: 'Mine', reviewPath: join(reviews, 'own-feat-y.md'), status: 'up_to_date' },
] }));
const app = createApp();
const OWN = { host: 'localhost:4477', 'content-type': 'application/json' };
const list = async () => (await app.request('/api/approvals', { headers: { host: 'localhost:4477' } })).json();
const dismiss = (body) => app.request('/api/dismiss', { method: 'POST', headers: OWN, body: JSON.stringify(body) });

test('the inbox lists each proposed comment of someone else\'s MR, not a finding without one, not an own review', async () => {
  const body = await list();
  assert.equal(body.canPost, false);
  assert.deepEqual(body.proposals.map((p) => [p.slug, p.findingId, p.iid, p.mrTitle, p.comment]), [['demo/feat-x', 'a', 5, 'Add coupons', 'Please guard the null.']]);
  assert.deepEqual(body.proposals[0].criticalPaths, ['Payment']);
  assert.equal(body.proposals[0].body, 'Why.');
});

test('a dismissed comment leaves the inbox and comes back on undo; an unknown review is a 404', async () => {
  assert.equal((await dismiss({ slug: 'demo/feat-x', commentId: 'a' })).status, 200);
  assert.deepEqual((await list()).proposals, []);
  assert.equal((await dismiss({ slug: 'demo/feat-x', commentId: 'a', undo: true })).status, 200);
  assert.equal((await list()).proposals.length, 1);
  assert.equal((await dismiss({ slug: 'demo/nope', commentId: 'a' })).status, 404);
  assert.equal((await dismiss({ slug: 'demo/feat-x', commentId: 'a b' })).status, 400);
});
