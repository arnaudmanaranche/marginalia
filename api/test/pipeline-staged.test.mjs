// The staged review and triage end to end, on a real git repo, with a fake `claude` that answers
// each stage (fixtures/fake-claude.mjs) and a local server standing in for GitLab's discussions.
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
  CLAUDE_BIN: join(here, 'fixtures', 'fake-claude.mjs'),
  GITLAB_BASE_URL: `http://127.0.0.1:${server.address().port}`, GITLAB_TOKEN: 't', GITLAB_USERNAME: 'me', GITLAB_PROJECT_ID: 'group/demo',
});
const { stagedReview } = await import('../dist/src/pipeline/review.js');
const { stagedTriage } = await import('../dist/src/pipeline/triage.js');
const { followRun } = await import('../dist/src/run-tracker.js');
const { buildShape } = await import('../dist/src/findings.js');
const { RUNS_DIR } = await import('../dist/src/run-journal.js');

const project = { key: 'demo', encodedId: encodeURIComponent('group/demo'), worktreeDir: repo, repoPath: repo, reviewsDir: join(tmp, 'reviews') };
const mr = { iid: 7, title: 'feat: coupons at checkout', description: 'Coupons.', source_branch: 'feat/coupons', target_branch: 'develop', project, author: { username: 'alice' }, web_url: null };

test('a staged review maps the change, reviews each chapter, and weighs the findings', async () => {
  const outputPath = join(project.reviewsDir, 'feat-coupons.md');
  const run = await followRun(mr, { kind: 'review', command: 'marginalia', outputPath, plan: 'staged-review' });
  const out = await stagedReview({ mr, run, outputPath, settings: null });
  const trace = await run.finish('reviewed');

  assert.deepEqual(trace.stages.map((s) => `${s.id}:${s.state}`), ['preflight:skipped', 'checkout:skipped', 'context:done', 'map:done', 'chapter-1:done', 'chapter-2:done', 'report:done']);
  assert.match(trace.stages[4].label, /Review: A coupon takes its percentage off/);
  assert.ok(trace.steps.some((s) => s.stage === 'chapter-2' && /did not fit the contract/.test(s.text)), 'chapter 2 was asked again');
  assert.ok(trace.steps.some((s) => s.stage === 'context' && /2 changed files.*CLAUDE\.md/.test(s.text)));
  assert.equal(trace.cost.usd.toFixed(2), '0.04');

  const shape = buildShape({ markdown: out.content, findingsRaw: out.findingsRaw });
  assert.equal(shape.source, 'json');
  assert.equal(shape.verdict, 'REQUEST_CHANGES');
  assert.equal(shape.findings[0].id, 'neg-total');
  assert.deepEqual(shape.tour.map((s) => s.findingIds), [['neg-total'], []]);
  assert.match(out.content, /\*\*Before:\*\* A coupon typed at checkout was ignored\./);
  assert.ok((await readdir(join(RUNS_DIR, 'demo', 'feat-coupons'))).some((f) => f.endsWith('.stream.jsonl')));
});

test('a staged triage weighs the reviewer threads, fixes one in its own commit, answers the other', async () => {
  const before = git('rev-parse', 'HEAD');
  const run = await followRun(mr, { kind: 'triage', command: 'marginalia', outputPath: join(project.reviewsDir, 'mr-comments-feat-coupons.md'), plan: 'staged-triage' });
  const out = await stagedTriage({ mr, run, settings: null });
  const trace = await run.finish('reviewed');

  assert.deepEqual(trace.stages.map((s) => `${s.id}:${s.state}`), ['preflight:skipped', 'checkout:skipped', 'context:done', 'conflicts:done', 'judge:done', 'fix-1:done', 'report:done']);
  assert.equal(trace.stages[5].label, 'Fix: src/pricing.mjs:1');
  const commit = git('rev-parse', 'HEAD');
  assert.notEqual(commit, before);
  assert.equal(git('rev-list', '--count', `${before}..HEAD`), '1');

  const shape = buildShape({ markdown: out.content, findingsRaw: out.findingsRaw });
  assert.deepEqual(shape.warnings, []);
  const fixed = shape.replies.find((r) => r.thread === 'aaaaaaaa1111');
  assert.deepEqual({ verdict: fixed.verdict, resolve: fixed.resolve, commit: fixed.commit }, { verdict: 'fixed', resolve: true, commit });
  const answered = shape.replies.find((r) => r.thread === 'bbbbbbbb2222');
  assert.equal(answered.verdict, 'answered');
  assert.equal(shape.replies.length, 2, 'my own note is not a thread to answer');
  assert.match(out.content, /Fix: commit `[0-9a-f]{8}`/);
  assert.match(await readFile(join(repo, 'src/pricing.mjs'), 'utf8'), /clamp/);
  assert.equal(git('log', '-1', '--format=%s%n%(trailers:key=Marginalia-Thread,valueonly)'), 'fix: Clamped the total at zero.\naaaaaaaa1111', 'the bot\'s commit, with the thread');
});

test('a triage on an MR that conflicts with its target merges it in and settles the conflict first', async () => {
  // develop moves on the line the MR changed.
  const mine = git('rev-parse', 'HEAD');
  git('checkout', '-q', 'develop');
  await writeFile(join(repo, 'src/pricing.mjs'), 'export const total = (items) => items.reduce((a, b) => a + b, 0) + 5;\n');
  git('commit', '-qam', 'shipping fee');
  git('update-ref', 'refs/remotes/origin/develop', 'HEAD');
  git('checkout', '-q', 'feat/coupons');

  const run = await followRun(mr, { kind: 'triage', command: 'marginalia', outputPath: join(project.reviewsDir, 'mr-comments-feat-coupons.md'), plan: 'staged-triage' });
  const out = await stagedTriage({ mr, run, settings: null });
  const trace = await run.finish('reviewed');

  assert.equal(trace.stages.find((s) => s.id === 'conflicts').state, 'done');
  assert.ok(trace.steps.some((s) => s.stage === 'conflicts' && /conflicts in 1 file\(s\): src\/pricing\.mjs/.test(s.text)));
  const merge = git('rev-list', '--merges', '-n', '1', `${mine}..HEAD`);
  assert.ok(merge, 'a merge commit');
  assert.equal(git('rev-parse', `${merge}^1`), mine, 'the merge sits on the MR head, so the push is a fast-forward');
  assert.match(out.content, /## Conflicts with the target branch[\s\S]*kept both/);
  assert.deepEqual(out.warnings, []);
});
