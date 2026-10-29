import { gitIn } from './git.ts';
import { parseWorktrees } from './worktree-guard.ts';

// The worktrees of a repo (see worktree-guard.ts for why the bot never prunes them).

// `git worktree list --porcelain`, as is.
export const worktreePorcelain = (repo) => gitIn(repo).run('worktree', 'list', '--porcelain');

// { path, branch, prunable } of each.
export const listWorktrees = async (repo) => parseWorktrees(await worktreePorcelain(repo));

// A detached worktree in `dir`, at `at` when given, else at the repo's HEAD.
export const addWorktree = (repo, dir, at = '') => gitIn(repo).run('worktree', 'add', '--quiet', '--detach', dir, ...(at ? [at] : []));

export const removeWorktree = (repo, dir) => gitIn(repo).run('worktree', 'remove', '--force', dir);

// The top of the work tree `dir` is in, or null when git does not recognise it as one.
export const worktreeTop = (dir) => gitIn(dir).run('rev-parse', '--show-toplevel').catch(() => null);
