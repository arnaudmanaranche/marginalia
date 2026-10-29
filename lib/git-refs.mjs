// @ts-check
import { gitIn } from './git.mjs';

// Named git operations the bot repeats, so each says what it is for and keeps its own policy:
// a worktree is only ever cleaned with `.claude` kept (it is a symlink to the repo's own).

export const head = (cwd) => gitIn(cwd).run('rev-parse', 'HEAD');

// The sha a ref points at, or null when there is no such ref.
export const refSha = (cwd, ref) => gitIn(cwd).run('rev-parse', '--verify', '--quiet', ref).catch(() => null);

export const isAncestor = (cwd, ancestor, of) => gitIn(cwd).ok('merge-base', '--is-ancestor', ancestor, of);

// Moves `ref` to `sha`; with `old`, only if it still points there (compare-and-swap).
export const updateRef = (cwd, ref, sha, old) => gitIn(cwd).run('update-ref', ref, sha, ...(old ? [old] : []));
export const deleteRef = (cwd, ref) => gitIn(cwd).run('update-ref', '-d', ref);

export const resetHard = (cwd, to = 'HEAD') => gitIn(cwd).run('reset', '--hard', '-q', to);

// Removes what a run left untracked. `ignored` removes ignored files too (.env and the like).
export const cleanWorktree = (cwd, { ignored = false } = {}) => gitIn(cwd).run('clean', ignored ? '-fdxq' : '-fdq', '-e', '.claude');

// Fetches an MR's head from origin: into `into` when given, else into FETCH_HEAD. A `+` forces it
// for a ref that was rebased since (a stack's lower layer).
export const fetchMrHead = (cwd, iid, into = /** @type {string | null} */ (null)) => gitIn(cwd).run('fetch', '--quiet', 'origin', into ? `+merge-requests/${iid}/head:${into}` : `merge-requests/${iid}/head`);

// Fetches a branch of origin into `into`.
export const fetchBranch = (cwd, branch, into) => gitIn(cwd).run('fetch', '--quiet', 'origin', `+${branch}:${into}`);

export const originUrl = (cwd) => gitIn(cwd).run('remote', 'get-url', 'origin');
