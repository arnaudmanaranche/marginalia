// Pushing the triage's fixes thread by thread, against a real bare origin: one fix alone lands on
// the MR branch, the others are replayed on top of it, and each is found again by its thread.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { execFileSync } from 'node:child_process';
import { mkdtemp, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';

process.env.MR_REVIEW_BOT_SKIP_CONFIG_CHECK = '1';
const { fixesStatus } = await import('../lib/fixes.mjs');
const { pushOneFix } = await import('../lib/fixes-push.mjs');

const tmp = await mkdtemp(join(tmpdir(), 'marginalia-push-test-'));
const origin = join(tmp, 'origin.git');
const repo = join(tmp, 'repo');
const run = (cwd, ...args) => execFileSync('git', ['-c', 'user.name=t', '-c', 'user.email=t@t', '-c', 'core.hooksPath=/dev/null', ...args], { cwd, stdio: 'pipe' }).toString().trim();
run(tmp, 'init', '-q', '--bare', '--template=', origin);
run(tmp, 'init', '-q', '-b', 'feat/x', '--template=', repo);
run(repo, 'remote', 'add', 'origin', origin);
for (const f of ['a', 'b', 'c']) await writeFile(join(repo, `${f}.txt`), `${f}\n`);
run(repo, 'add', '-A');
run(repo, 'commit', '-qm', 'the MR');
run(repo, 'push', '-q', 'origin', 'feat/x');
const fix = async (file, thread) => {
  await writeFile(join(repo, file), `${file} fixed\n`);
  run(repo, 'commit', '-qam', `fix: ${file}`, '-m', `Marginalia-Thread: ${thread}`);
};
await fix('a.txt', 'thread-a');
await fix('b.txt', 'thread-b');
await fix('c.txt', 'thread-c');
run(repo, 'update-ref', 'refs/heads/marginalia/feat-x', 'HEAD');
run(repo, 'reset', '-q', '--hard', 'origin/feat/x');

const project = { repoPath: repo };
const mr = { iid: 3, source_branch: 'feat/x' };

test('the fixes say which thread each answers, and none has landed yet', async () => {
  const status = await fixesStatus(project, mr);
  assert.equal(status.state, 'ready');
  assert.deepEqual(status.commits.map((c) => c.thread), ['thread-c', 'thread-b', 'thread-a']);
  assert.deepEqual(status.landed, []);
});

test('one fix pushed alone lands on the MR; the others still wait on top of it', async () => {
  const before = await fixesStatus(project, mr);
  const b = before.commits.find((c) => c.thread === 'thread-b');
  const out = await pushOneFix(project, mr, b.sha);
  assert.equal(out.pushed, true);
  assert.deepEqual(out.status.landed.map((l) => l.thread), ['thread-b']);
  assert.equal(run(origin, 'show', 'feat/x:b.txt'), 'b.txt fixed');
  assert.equal(run(origin, 'show', 'feat/x:a.txt'), 'a', 'the older fix was not pushed with it');
  assert.equal(out.status.state, 'ready');
  assert.deepEqual(out.status.commits.map((c) => c.thread), ['thread-c', 'thread-a']);
  assert.equal(run(repo, 'worktree', 'list').split('\n').length, 1, 'the throwaway worktree is gone');
});

test('the oldest fix is pushed as it is, and pushing all lands every thread', async () => {
  const before = await fixesStatus(project, mr);
  const a = before.commits.find((c) => c.thread === 'thread-a');
  const out = await pushOneFix(project, mr, a.sha);
  assert.equal(out.status.landed.find((l) => l.thread === 'thread-a').sha, a.sha, 'no replay, same commit');
  const { pushFixes } = await import('../lib/fixes.mjs');
  const all = await pushFixes(project, mr);
  assert.equal(all.status.state, 'pushed');
  assert.deepEqual(all.status.landed.map((l) => l.thread).sort(), ['thread-a', 'thread-b', 'thread-c']);
});

test('a fix that is not one of them is refused', async () => {
  const out = await pushOneFix(project, mr, '0'.repeat(40));
  assert.equal(out.pushed, false);
  assert.match(out.error, /nothing to push \(pushed\)/);
});
