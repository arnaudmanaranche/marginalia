// Safety rules for the bot's git worktree, pure so they are tested without a repository.
//
// A repo's worktrees are registered inside its .git, as absolute paths. Another machine, or a
// container that mounts the same checkout, sees different paths: from there every worktree of
// the host looks "missing", and `git worktree prune` would delete all their registrations. That
// happened once (the registrations of every worktree of a developer's repo were lost), so the
// bot never prunes, and a container refuses to work in a checkout that has worktrees it cannot see.

/** @param {string} porcelain output of `git worktree list --porcelain` */
export function parseWorktrees(porcelain: string) {
  return porcelain.split('\n\n').filter(Boolean).map((block: string) => ({
    path: block.match(/^worktree (.+)$/m)?.[1] ?? '',
    branch: block.match(/^branch refs\/heads\/(.+)$/m)?.[1] ?? null,
    prunable: /^prunable\b/m.test(block),
  }));
}

/**
 * Worktrees other than the main one whose folder is not visible from here.
 * @param {string} porcelain @param {(path: string) => boolean} exists
 */
export const foreignWorktrees = (porcelain: string, exists: (path: string) => boolean) => parseWorktrees(porcelain).slice(1).filter((w) => !exists(w.path));

/** @param {string} repoPath @param {{ path: string }[]} foreign */
export const foreignWorktreesMessage = (repoPath: string, foreign: { path: string }[]) =>
  `${repoPath} has ${foreign.length} git worktree(s) whose folders this container cannot see (${foreign.slice(0, 3).map((w) => w.path).join(', ')}${foreign.length > 3 ? ', ...' : ''}): it is a checkout you also use from the host. `
  + 'Working in it would leave worktree entries that point inside the container, and the host\'s own would look broken. '
  + 'Mount a dedicated clone that only the container uses (see "Run in a container" in the README).';

// The folder the bot is about to `git clean -fdx`: git must say it is the top of its own
// work tree. A folder that lost its registration, or one that is merely inside another repo,
// would otherwise clean the wrong place (`-x` also removes ignored files such as .env).
/** @param {string} dir @param {string | null} top what `git rev-parse --show-toplevel` said there, or null if it failed */
export const botWorktreeProblem = (dir: string, top: string | null) => (top === dir ? null
  : top === null
    ? `${dir} is not a working git worktree (git does not recognise it: its registration in the repo's .git is probably gone). Refusing to run git clean there. Delete the folder so the bot recreates it, or repair it with \`git worktree repair ${dir}\`.`
    : `${dir} is inside the git work tree ${top} instead of being a worktree of its own. Refusing to run git clean there: it would clean ${top}. Delete the folder so the bot recreates it.`);
