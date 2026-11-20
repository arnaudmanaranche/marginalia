import { mkdir, mkdtemp, realpath, rm, stat } from 'node:fs/promises';
import { dirname, join, sep } from 'node:path';
import { DATA_DIR } from './config.ts';
import { gitIn } from './git.ts';
import { addWorktree, listWorktrees, removeWorktree } from './git-worktree.ts';

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

// What a crash left in the scratch folder: each worktree of `repoPath` registered under it whose
// folder is gone, or older than `olderThanMs` (one a run still uses is younger), is removed by its
// own path. Never a prune: no other worktree of the repo is touched.
export async function sweepScratchWorktrees(repoPath: string, { olderThanMs = 60 * 60_000, now = Date.now() }: { olderThanMs?: number; now?: number } = {}) {
  await mkdir(SCRATCH_DIR, { recursive: true });
  const root = `${await realpath(SCRATCH_DIR)}${sep}`;
  const removed: string[] = [];
  for (const w of await listWorktrees(repoPath)) {
    if (!w.path.startsWith(root)) continue;
    const at = await stat(w.path).then((s) => s.mtimeMs, () => 0);
    if (now - at < olderThanMs) continue;
    await removeWorktree(repoPath, w.path).catch(() => null);
    await rm(dirname(w.path), { recursive: true, force: true });
    removed.push(w.path);
  }
  return removed;
}

// Whether `sha` is a commit this repo holds (a review's head can be gone after a gc or a force-push).
export const hasCommit = (repoPath: string, sha: string) => gitIn(repoPath).ok('cat-file', '-e', `${sha}^{commit}`);
