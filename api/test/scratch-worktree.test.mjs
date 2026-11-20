// Throwaway worktrees: made under the bot's own folder, at the commit asked for, and gone after,
// registration included, whether the work in them succeeded or not.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { existsSync } from 'node:fs';
import { mkdtemp, readFile, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { git, makeRepo } from './support/git-repo.mjs';

process.env.MR_REVIEW_BOT_SKIP_CONFIG_CHECK = '1';
process.env.MARGINALIA_HOME = await mkdtemp(join(tmpdir(), 'marginalia-home-'));
const { SCRATCH_DIR, hasCommit, withScratchWorktree } = await import('../dist/src/scratch-worktree.js');

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

test('a commit the repo does not hold is told apart', async () => {
  const { repo } = await makeRepo();
  assert.equal(await hasCommit(repo, git(repo, 'rev-parse', 'HEAD')), true);
  assert.equal(await hasCommit(repo, '0123456789abcdef0123456789abcdef01234567'), false);
});
