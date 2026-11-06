// The verify stage of a staged review (ADR 0009), on a real git repo, with a fake `claude` and a fake
// `docker`: what runs when, what is skipped and why, and that a verification never fails the review.
import { test, after } from 'node:test';
import assert from 'node:assert/strict';
import { execFileSync } from 'node:child_process';
import { createServer } from 'node:http';
import { mkdtemp, mkdir, readFile, readdir, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

const here = dirname(fileURLToPath(import.meta.url));
const tmp = await mkdtemp(join(tmpdir(), 'marginalia-staged-'));
const repo = join(tmp, 'repo');
// No hook of the machine running the tests may add files to the repo.
const git = (...args) => execFileSync('git', ['-c', 'user.name=t', '-c', 'user.email=t@t', '-c', 'core.hooksPath=/dev/null', ...args], { cwd: repo, stdio: 'pipe' }).toString().trim();
await mkdir(join(repo, 'src'), { recursive: true });
git('init', '-q', '-b', 'develop', '--template=');
await writeFile(join(repo, 'CLAUDE.md'), '# Rules\nKeep pricing pure.\n');
await writeFile(join(repo, 'src/pricing.mjs'), 'export const total = (items) => items.reduce((a, b) => a + b, 0);\n');
git('add', '-A');
git('commit', '-qm', 'base');
git('update-ref', 'refs/remotes/origin/develop', 'HEAD');
git('checkout', '-qb', 'feat/coupons');
await writeFile(join(repo, 'src/pricing.mjs'), 'export const total = (items, coupon = 0) => items.reduce((a, b) => a + b, 0) * (1 - coupon / 100);\n');
await writeFile(join(repo, 'src/pricing.test.mjs'), 'test("coupon", () => {});\n');
git('add', '-A');
git('commit', '-qm', 'coupons');

const note = (id, body, path, line, user = 'bob') => ({ id, body, system: false, resolvable: true, resolved: false, created_at: '2026-10-01T10:00:00Z', author: { username: user, name: user }, position: path ? { new_path: path, new_line: line, head_sha: 'x' } : undefined });
const DISCUSSIONS = [
  { id: 'aaaaaaaa1111', notes: [note(1, 'What if the coupon is above 100%?', 'src/pricing.mjs', 1)] },
  { id: 'bbbbbbbb2222', notes: [note(2, 'Where does the coupon come from?')] },
  { id: 'cccccccc3333', notes: [note(3, 'My own note.', null, null, 'me')] },
];
const server = createServer((req, res) => {
  res.setHeader('content-type', 'application/json');
  res.end(req.url.includes('/discussions') ? JSON.stringify(DISCUSSIONS) : '[]');
});
await new Promise((r) => server.listen(0, '127.0.0.1', r));
after(() => server.close());

Object.assign(process.env, {
  MR_REVIEW_BOT_SKIP_CONFIG_CHECK: '1', MARGINALIA_DB: ':memory:', MARGINALIA_HOME: join(tmp, 'home'),
  CLAUDE_BIN: join(here, 'fixtures', 'fake-claude.mjs'), VERIFY_RUNNER_IMAGE: 'runner-image', DOCKER_BIN: join(here, 'fixtures', 'fake-docker.mjs'), FAKE_CLAUDE_LOG: join(tmp, 'claude.log'),
  GITLAB_BASE_URL: `http://127.0.0.1:${server.address().port}`, GITLAB_TOKEN: 't', GITLAB_USERNAME: 'me', GITLAB_PROJECT_ID: 'group/demo',
});
const { stagedReview } = await import('../dist/src/pipeline/review.js');
const { saveDraft, approveDraft } = await import('../dist/src/context-store.js');
const { STAGE_VERIFY_TOOLS } = await import('../dist/src/allowed-tools.js');
const { followRun } = await import('../dist/src/run-tracker.js');
const { buildShape } = await import('../dist/src/findings.js');

const project = { key: 'demo', encodedId: encodeURIComponent('group/demo'), worktreeDir: repo, repoPath: repo, reviewsDir: join(tmp, 'reviews'), verify: true };
const mr = { iid: 7, title: 'feat: coupons at checkout', description: 'Coupons.', source_branch: 'feat/coupons', target_branch: 'develop', project, author: { username: 'alice' }, web_url: null };


const src = [{ kind: 'file', ref: 'README.md' }];
const context = (verification) => ({
  summary: 'A shop.', glossary: [{ name: 'Coupon', summary: 'A percentage off.', sources: src }], stack: [{ name: 'Tests', summary: 'Unit tests.', sources: src }],
  features: [{ name: 'Checkout', summary: 'Pay.', sources: src }], criticalPaths: [{ name: 'Checkout', summary: 'Pay.', rank: 1, sources: src }], ...(verification && { verification }),
});
const recipe = { steps: [{ purpose: 'test', run: 'run the tests', summary: 'The unit tests.', sources: src }], hosts: [] };
const approve = async (verification) => {
  await saveDraft(join(tmp, 'home'), { key: 'demo', commit: 'abc', context: context(verification) });
  await approveDraft(join(tmp, 'home'), 'demo', 'me');
};

async function review(env = {}, overrides = {}) {
  Object.assign(process.env, { FAKE_PROOF: 'runtime', FAKE_VERIFY: '', ...env });
  const m = { ...mr, project: { ...project, ...overrides } };
  const outputPath = join(project.reviewsDir, 'feat-coupons.md');
  const run = await followRun(m, { kind: 'review', command: 'marginalia', outputPath });
  const out = await stagedReview({ mr: m, run, outputPath, settings: null });
  const trace = await run.finish('reviewed');
  return { trace, shape: buildShape({ markdown: out.content, findingsRaw: out.findingsRaw }), out };
}
const verdictOf = (shape) => shape.findings.find((f) => f.id === 'neg-total').verification;

test('a blocking finding about behaviour is reproduced by a stage that has only the runner tools', async () => {
  await approve(recipe);
  await writeFile(process.env.FAKE_CLAUDE_LOG, '');
  const { trace, shape, out } = await review();
  assert.deepEqual(trace.stages.map((s) => `${s.id}:${s.state}`), ['preflight:skipped', 'checkout:skipped', 'context:done', 'map:done', 'chapter-1:done', 'chapter-2:done', 'verify-1:done', 'report:done']);
  assert.match(trace.stages[6].label, /Reproduce: The total can go below zero/);
  assert.equal(verdictOf(shape).status, 'reproduced');
  assert.match(verdictOf(shape).evidence, /-50/);
  assert.equal(shape.verdict, 'REQUEST_CHANGES');
  const [call] = (await readFile(process.env.FAKE_CLAUDE_LOG, 'utf8')).trim().split('\n').map((l) => JSON.parse(l));
  assert.equal(call.args[call.args.indexOf('--allowedTools') + 1], STAGE_VERIFY_TOOLS.join(' '));
  assert.ok(call.args.includes('--strict-mcp-config'));
  const server = JSON.parse(call.args[call.args.indexOf('--mcp-config') + 1]).mcpServers.verify;
  assert.match(server.args[0], /bin\/verify-mcp\.js$/);
  assert.match(call.prompt, /run the tests/, 'the agent is told the recipe');
});

test('a finding about a pattern is never run, and a project that did not opt in is left alone', async () => {
  const pattern = await review({ FAKE_PROOF: 'static' });
  assert.ok(!pattern.trace.stages.some((s) => s.id.startsWith('verify')));
  assert.equal(verdictOf(pattern.shape), undefined);
  const off = await review({}, { verify: false });
  assert.ok(!off.trace.stages.some((s) => s.id.startsWith('verify')));
  assert.equal(verdictOf(off.shape), undefined, 'no opt-in: nothing is said');
});

test('a verification that cannot run is skipped or inconclusive, never a failed review', async () => {
  const garbage = await review({ FAKE_VERIFY: 'garbage' });
  assert.equal(verdictOf(garbage.shape).status, 'inconclusive');
  assert.equal(garbage.shape.verdict, 'REQUEST_CHANGES', 'the finding and the verdict stay');
  assert.ok(garbage.trace.stages.find((s) => s.id === 'verify-1').state === 'failed');
  const crash = await review({ FAKE_VERIFY: 'crash' });
  assert.equal(verdictOf(crash.shape).status, 'inconclusive');
  const notReproduced = await review({ FAKE_VERIFY: 'not_reproduced' });
  assert.equal(verdictOf(notReproduced.shape).status, 'not_reproduced');
  assert.equal(notReproduced.shape.findings[0].severity, 'important', 'a finding that is not reproduced is kept for a person to decide');
  await approve(undefined);
  const noRecipe = await review();
  assert.equal(verdictOf(noRecipe.shape).status, 'skipped');
  assert.match(verdictOf(noRecipe.shape).evidence, /no recipe/);
  assert.ok(!noRecipe.trace.stages.some((s) => s.id.startsWith('verify')));
  assert.ok(noRecipe.out.warnings.some((w) => /did not run/.test(w)));
});
