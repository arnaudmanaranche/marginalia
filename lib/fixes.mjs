import { execFileAsync } from './exec.mjs';
import { REPO_LOCAL_PATH } from './config.mjs';
import { fixesRef } from './paths.mjs';

const git = (args) => execFileAsync('git', args, { cwd: REPO_LOCAL_PATH }).then(({ stdout }) => stdout.trim());
const succeeds = (args) => git(args).then(() => true, () => false);

// Where the MR's branch is on origin right now, without touching any local ref.
export async function remoteHead(branch) {
  const line = await git(['ls-remote', 'origin', `refs/heads/${branch}`]);
  return line.split(/\s/)[0] || null;
}

// Where the triage fixes of an MR stand against its branch on origin:
//   none      no fixes ref (the triage changed nothing)
//   ready     the fixes sit on top of the current MR head: a plain push fast-forwards it
//   pushed    the MR branch already contains them
//   outdated  the MR branch moved since the triage: the fixes no longer apply on top of it
// `mr` needs { iid, source_branch }.
export async function fixesStatus(mr) {
  const ref = fixesRef(mr);
  const fixesSha = await git(['rev-parse', '--verify', '--quiet', `refs/heads/${ref}`]).catch(() => null);
  if (!fixesSha) return { ref, branch: mr.source_branch, state: 'none', fixesSha: null, remoteSha: null, commits: [] };
  const remoteSha = await remoteHead(mr.source_branch);
  const base = { ref, branch: mr.source_branch, fixesSha, remoteSha, commits: [] };
  if (!remoteSha) return { ...base, state: 'outdated' };
  // The remote head may be commits pushed since the triage that this repo hasn't fetched yet.
  if (!(await succeeds(['cat-file', '-e', `${remoteSha}^{commit}`]))) {
    await git(['fetch', '--quiet', 'origin', `+refs/heads/${mr.source_branch}:refs/marginalia/remote/${mr.iid}`]).catch(() => null);
  }
  if (remoteSha === fixesSha || (await succeeds(['merge-base', '--is-ancestor', fixesSha, remoteSha]))) return { ...base, state: 'pushed' };
  if (!(await succeeds(['merge-base', '--is-ancestor', remoteSha, fixesSha]))) return { ...base, state: 'outdated' };
  const log = await git(['log', '--format=%H%x00%s', `${remoteSha}..${fixesSha}`]);
  const commits = log.split('\n').filter(Boolean).map((l) => {
    const [sha, subject] = l.split('\0');
    return { sha, subject };
  });
  return { ...base, state: 'ready', commits };
}

// Pushes the fixes to the MR branch, fast-forward only: checked here first for a clear
// answer, and enforced by git itself (no --force) if the branch moves in between.
export async function pushFixes(mr) {
  const before = await fixesStatus(mr);
  if (before.state !== 'ready') return { pushed: false, status: before };
  await git(['push', '--quiet', 'origin', `${before.fixesSha}:refs/heads/${mr.source_branch}`]);
  return { pushed: true, status: await fixesStatus(mr) };
}
