// The project context in the studio: read both versions, approve the draft. Nothing reaches GitLab.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { mkdtemp, mkdir, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';

const dir = await mkdtemp(join(tmpdir(), 'marginalia-context-'));
Object.assign(process.env, {
  MR_REVIEW_BOT_SKIP_CONFIG_CHECK: '1', MARGINALIA_DB: ':memory:', STUDIO_PORT: '4477',
  GITLAB_BASE_URL: 'https://git.example.com', GITLAB_USERNAME: 'me', GITLAB_TOKEN: 't', GITLAB_PROJECT_ID: 'group/demo',
  REPO_LOCAL_PATH: dir, MARGINALIA_HOME: dir,
});
const { createApp } = await import('../dist/src/http/app.js');
const { DATA_DIR } = await import('../dist/src/config.js');
const { saveDraft } = await import('../dist/src/context-store.js');
await mkdir(join(dir, '.claude', 'reviews'), { recursive: true });
await writeFile(join(dir, 'status.json'), JSON.stringify({ pid: 1, phase: 'idle', mrs: [] }));
const app = createApp();
const OWN = { host: 'localhost:4477', 'content-type': 'application/json' };
const get = (path) => app.request(path, { headers: { host: 'localhost:4477' } });
const post = (path) => app.request(path, { method: 'POST', headers: OWN, body: '{}' });

const src = [{ kind: 'file', ref: 'README.md' }];
const context = { summary: 'A demo.', glossary: [{ name: 'Trip', summary: 'Days.', sources: src }], stack: [{ name: 'Node', summary: '22.', sources: src }], features: [{ name: 'Search', summary: 'Find.', sources: src }], criticalPaths: [{ name: 'Pay', summary: 'Pay.', rank: 1, sources: src }] };

test('an unknown project is a 404, a project without context has neither version', async () => {
  assert.equal((await get('/api/projects/nope/context')).status, 404);
  const body = await (await get('/api/projects/demo/context')).json();
  assert.deepEqual([body.draft, body.approved, body.learning], [null, null, false]);
  assert.deepEqual((await (await get('/api/contexts')).json()).contexts, [{ project: 'demo', draftLearnedAt: null, approvedAt: null }]);
});

test('approving needs a draft; the person approving is recorded and the draft becomes what reviews use', async () => {
  assert.equal((await post('/api/projects/demo/context/approve')).status, 409);
  await saveDraft(DATA_DIR, { key: 'demo', commit: 'abc123', context });
  assert.ok((await (await get('/api/contexts')).json()).contexts[0].draftLearnedAt);
  const res = await post('/api/projects/demo/context/approve');
  assert.equal(res.status, 200);
  const body = await res.json();
  assert.equal(body.draft, null);
  assert.equal(body.approved.approvedBy, 'me');
  assert.equal(body.approved.context.summary, 'A demo.');
});

test('a write from another page is refused before it is read', async () => {
  const res = await app.request('/api/projects/demo/context/approve', { method: 'POST', headers: { ...OWN, origin: 'https://evil.example' }, body: '{}' });
  assert.equal(res.status, 403);
});
