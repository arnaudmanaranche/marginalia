// A command run end to end, with a scripted fake `claude` (fixtures/fake-agent.mjs): a result that
// follows the contract is kept, one that does not fails visibly, whatever the agent printed.
import { test, after } from 'node:test';
import assert from 'node:assert/strict';
import { createServer } from 'node:http';
import { mkdtemp, mkdir, readFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

const here = dirname(fileURLToPath(import.meta.url));
const tmp = await mkdtemp(join(tmpdir(), 'marginalia-flow-'));
const worktree = join(tmp, 'wt');
await mkdir(worktree, { recursive: true });
const server = createServer((req, res) => { res.setHeader('content-type', 'application/json'); res.end('[]'); });
await new Promise((r) => server.listen(0, '127.0.0.1', r));
after(() => server.close());
const argvFile = join(tmp, 'argv.json');
Object.assign(process.env, {
  MR_REVIEW_BOT_SKIP_CONFIG_CHECK: '1', MARGINALIA_DB: ':memory:', MARGINALIA_HOME: join(tmp, 'home'),
  CLAUDE_BIN: join(here, 'fixtures', 'fake-agent.mjs'), FAKE_ARGV_FILE: argvFile,
  GITLAB_BASE_URL: `http://127.0.0.1:${server.address().port}`, GITLAB_TOKEN: 't', GITLAB_USERNAME: 'me', GITLAB_PROJECT_ID: 'group/demo',
});
const { commandRun } = await import('../dist/src/command-run.js');
const { followRun } = await import('../dist/src/run-tracker.js');

const project = { key: 'demo', encodedId: encodeURIComponent('group/demo'), worktreeDir: worktree, repoPath: worktree, reviewsDir: join(tmp, 'reviews') };
const mr = { iid: 7, title: 'feat: coupons', description: '', source_branch: 'feat', target_branch: 'develop', project, author: { username: 'alice' }, web_url: null };

async function run(mode) {
  process.env.FAKE_AGENT_MODE = mode;
  const outputPath = join(project.reviewsDir, 'feat.md');
  const tracker = await followRun(mr, { kind: 'review', command: '/review', outputPath });
  try {
    return await commandRun({ mr, run: tracker, kind: 'review', command: '/review', tools: ['Read'], outputPath });
  } finally {
    await tracker.finish('reviewed');
  }
}

test('a result that follows the contract is kept, and the run was handed the catalog', async () => {
  const report = await run('valid');
  assert.equal(report.shape.source, 'json');
  assert.equal(report.shape.findings.length, 1);
  const argv = JSON.parse(await readFile(argvFile, 'utf8'));
  assert.ok(argv.some((a, i) => argv[i - 1] === '--plugin-dir' && a.endsWith('/catalog')), 'the catalog plugin is loaded');
  const prompt = argv[argv.indexOf('--append-system-prompt') + 1];
  assert.match(prompt, /always follow marginalia:marginalia-review/);
  assert.match(prompt, /marginalia:security/);
});

test('a findings file that breaks the contract fails the run', async () => {
  await assert.rejects(run('no-overview'), /broke the contract.*overview/);
});

test('garbage on stdout and no findings file fails the run, nothing is kept as a report', async () => {
  await assert.rejects(run('garbage'), /broke the contract: no findings file/);
});
