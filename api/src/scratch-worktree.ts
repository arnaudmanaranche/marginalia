import { mkdir, mkdtemp, rm } from 'node:fs/promises';
import { join } from 'node:path';
import { DATA_DIR } from './config.ts';
import { gitIn } from './git.ts';
import { addWorktree, removeWorktree } from './git-worktree.ts';

// Throwaway worktrees (a stop's question, a fix replayed before its push) live here and only here:
// a folder the bot owns, so what a crash leaves behind can be told from anyone else's worktree.
export const SCRATCH_DIR = join(DATA_DIR, 'tmp-worktrees');

// Runs `fn` in a fresh detached worktree of `repoPath` at `at`, removed after, registration included.
export async function withScratchWorktree<T>(repoPath: string, at: string, fn: (dir: string) => Promise<T>): Promise<T> {
  await mkdir(SCRATCH_DIR, { recursive: true });
  const holder = await mkdtemp(join(SCRATCH_DIR, 'wt-'));
  const dir = join(holder, 'tree');
  try {
    await addWorktree(repoPath, dir, at);
    return await fn(dir);
  } finally {
    await removeWorktree(repoPath, dir).catch(() => null);
    await rm(holder, { recursive: true, force: true });
  }
}

// Whether `sha` is a commit this repo holds (a review's head can be gone after a gc or a force-push).
export const hasCommit = (repoPath: string, sha: string) => gitIn(repoPath).ok('cat-file', '-e', `${sha}^{commit}`);
