// @ts-check
import { gitIn } from './git.mjs';
import { parseWorktrees } from './worktree-guard.mjs';

// The worktrees of a repo (see worktree-guard.mjs for why the bot never prunes them).

// `git worktree list --porcelain`, as is.
export const worktreePorcelain = (repo) => gitIn(repo).run('worktree', 'list', '--porcelain');

// { path, branch, prunable } of each.
export const listWorktrees = async (repo) => parseWorktrees(await worktreePorcelain(repo));

export const addWorktree = (repo, dir) => gitIn(repo).run('worktree', 'add', '--detach', dir);

// The top of the work tree `dir` is in, or null when git does not recognise it as one.
export const worktreeTop = (dir) => gitIn(dir).run('rev-parse', '--show-toplevel').catch(() => null);
