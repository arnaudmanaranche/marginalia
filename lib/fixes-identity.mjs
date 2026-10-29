// @ts-check
import { execFileAsync } from './exec.mjs';
import { commitIdentity } from './git-identity.mjs';

const git = (cwd, args, env = {}) => execFileAsync('git', args, { cwd, env: { ...process.env, ...env } }).then(({ stdout }) => String(stdout).trim());

// Fixes committed under another identity than mine (an agent's commit, or an older bot that
// committed as marginalia@localhost) are rewritten as mine before they are pushed: same trees,
// messages and author dates, merges kept, only the names change. They were never pushed, so
// nobody holds the old commits. The fixes ref moves only if nothing moved it meanwhile.
// `status` is a `ready` fixesStatus(). -> true when the fixes were rewritten.
/** @param {{ repoPath: string }} project @param {{ ref: string, remoteSha: string | null, fixesSha: string | null }} status */
export async function ownFixes(project, status) {
  const id = await commitIdentity();
  if (!id || !status.remoteSha || !status.fixesSha) return false;
  const cwd = project.repoPath;
  const log = await git(cwd, ['log', '--reverse', '--date=raw', '--format=%H%x00%P%x00%T%x00%ae%x00%ce%x00%ad%x1e', `${status.remoteSha}..${status.fixesSha}`]);
  const commits = log.split('\x1e').map((r) => r.trim()).filter(Boolean).map((r) => {
    const [sha, parents, tree, authorEmail, committerEmail, date] = r.split('\0');
    return { sha, parents: parents.split(' ').filter(Boolean), tree, authorEmail, committerEmail, date };
  });
  if (commits.every((c) => c.authorEmail === id.email && c.committerEmail === id.email)) return false;
  const rewritten = new Map();
  let head = status.remoteSha;
  for (const c of commits) {
    const message = await git(cwd, ['log', '-1', '--format=%B', c.sha]);
    const parents = c.parents.flatMap((p) => ['-p', rewritten.get(p) ?? p]);
    head = await git(cwd, ['commit-tree', c.tree, ...parents, '-m', message], {
      GIT_AUTHOR_NAME: id.name, GIT_AUTHOR_EMAIL: id.email, GIT_AUTHOR_DATE: c.date,
      GIT_COMMITTER_NAME: id.name, GIT_COMMITTER_EMAIL: id.email,
    });
    rewritten.set(c.sha, head);
  }
  await git(cwd, ['update-ref', `refs/heads/${status.ref}`, head, status.fixesSha]);
  return true;
}
