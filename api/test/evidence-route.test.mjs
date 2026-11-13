// The evidence route (ADR 0010): a file a browser reproduction kept is served to whoever may see its
// project, by the names the browse tool writes, and to nobody else.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { mkdir, mkdtemp, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';

const home = await mkdtemp(join(tmpdir(), 'marginalia-evidence-'));
Object.assign(process.env, {
  MR_REVIEW_BOT_SKIP_CONFIG_CHECK: '1', MARGINALIA_DB: ':memory:', MARGINALIA_HOME: home,
  GITLAB_BASE_URL: 'https://git.example.com', GITLAB_USERNAME: 'me', GITLAB_TOKEN: 't', GITLAB_PROJECT_ID: 'group/demo', REPO_LOCAL_PATH: home,
});
const { PROJECTS } = await import('../dist/src/projects.js');
const { DATA_DIR } = await import('../dist/src/config.js');
const { createApp } = await import('../dist/src/http/app.js');

const key = PROJECTS[0].key;
const folder = join(DATA_DIR, 'evidence', key, 'run-1-verify-1');
await mkdir(folder, { recursive: true });
await writeFile(join(folder, 'screenshot.png'), 'png');
await writeFile(join(folder, 'evidence.json'), '[]');
const app = createApp();
const get = (path) => app.request(`http://localhost${path}`, { headers: { host: 'localhost' } });

test('a file of a visible project is served with a type that cannot run anything', async () => {
  const res = await get(`/api/evidence/${key}/run-1-verify-1/screenshot.png`);
  assert.equal(res.status, 200);
  assert.equal(res.headers.get('content-type'), 'image/png');
  assert.equal(res.headers.get('x-content-type-options'), 'nosniff');
  assert.match(res.headers.get('content-security-policy'), /sandbox/);
});

test('a project the caller cannot see, an unknown file and the manifest are all a 404', async () => {
  for (const path of [`/api/evidence/elsewhere/run-1-verify-1/screenshot.png`, `/api/evidence/${key}/run-1-verify-1/evidence.json`, `/api/evidence/${key}/run-1-verify-1/other.png`, `/api/evidence/${key}/nope/screenshot.png`]) {
    assert.equal((await get(path)).status, 404, path);
  }
});
