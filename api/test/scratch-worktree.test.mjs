// Throwaway worktrees: made under the bot's own folder, at the commit asked for, and gone after,
// registration included, whether the work in them succeeded or not.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { existsSync } from 'node:fs';
import { mkdtemp, readFile, rm, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { git, makeRepo } from './support/git-repo.mjs';

process.env.MR_REVIEW_BOT_SKIP_CONFIG_CHECK = '1';
process.env.MARGINALIA_HOME = await mkdtemp(join(tmpdir(), 'marginalia-home-'));
const { SCRATCH_DIR, hasCommit, sweepScratchWorktrees, withScratchWorktree } = await import('../dist/src/scratch-worktree.js');

test('the work runs at the commit asked for, in the bot\'s folder, and the worktree is gone after', async () => {
  const { repo } = await makeRepo({ files: { 'a.txt': 'old\n' } });
  const first = git(repo, 'rev-parse', 'HEAD');
  await writeFile(join(repo, 'a.txt'), 'new\n');
  git(repo, 'commit', '-qam', 'second');
  let seen = null;
  const text = await withScratchWorktree(repo, first, async (dir) => {
    seen = dir;
    return readFile(join(dir, 'a.txt'), 'utf8');
  });
  assert.equal(text, 'old\n');
  assert.ok(seen.startsWith(SCRATCH_DIR));
  assert.ok(!existsSync(seen));
  assert.doesNotMatch(git(repo, 'worktree', 'list'), /tmp-worktrees/);
});

test('a failing work still removes its worktree', async () => {
  const { repo } = await makeRepo();
  let seen = null;
  await assert.rejects(withScratchWorktree(repo, 'HEAD', async (dir) => { seen = dir; throw new Error('boom'); }), /boom/);
  assert.ok(!existsSync(seen));
  assert.doesNotMatch(git(repo, 'worktree', 'list'), /tmp-worktrees/);
});

test('the sweep removes only old scratch worktrees, folder gone or not, and no one else\'s', async () => {
  const { repo } = await makeRepo();
  const someone = join(await mkdtemp(join(tmpdir(), 'marginalia-other-')), 'theirs');
  git(repo, 'worktree', 'add', '--quiet', '--detach', someone);
  await rm(someone, { recursive: true });
  const crashed = [];
  await withScratchWorktree(repo, 'HEAD', async (dir) => { crashed.push(dir); });
  // Two crashes, simulated: registered again and left, one with its folder deleted too.
  for (const n of [1, 2]) {
    const dir = join(SCRATCH_DIR, `wt-crash${n}`, 'tree');
    git(repo, 'worktree', 'add', '--quiet', '--detach', dir);
    crashed.push(dir);
  }
  await rm(crashed[2], { recursive: true });
  const now = await sweepScratchWorktrees(repo);
  assert.equal(now.length, 1, 'one whose folder is gone is not in use, whatever its age; a young one is left alone');
  assert.match(now[0], /wt-crash2/);
  const later = await sweepScratchWorktrees(repo, { now: Date.now() + 2 * 60 * 60_000 });
  assert.equal(later.length, 1);
  assert.match(later[0], /wt-crash1/);
  const list = git(repo, 'worktree', 'list');
  assert.doesNotMatch(list, /wt-crash/);
  assert.match(list, /theirs/, 'a stale worktree that is not the bot\'s is still registered');
  assert.ok(!existsSync(join(SCRATCH_DIR, 'wt-crash1')));
});

test('a commit the repo does not hold is told apart', async () => {
  const { repo } = await makeRepo();
  assert.equal(await hasCommit(repo, git(repo, 'rev-parse', 'HEAD')), true);
  assert.equal(await hasCommit(repo, '0123456789abcdef0123456789abcdef01234567'), false);
});
