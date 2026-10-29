// @ts-check
import { execFileAsync } from './exec.mjs';
import { log, warn } from './log.mjs';
import { branchSlug, fixesRef } from './paths.mjs';
import { FIX_LOG_FORMAT, landedByThread, parseFixLog } from './fixes-log.mjs';

const git = (project, args) => execFileAsync('git', args, { cwd: project.repoPath }).then(({ stdout }) => stdout.trim());
// How far down the MR branch a pushed fix is looked for.
const LANDED_DEPTH = 200;
const succeeds = (project, args) => git(project, args).then(() => true, () => false);

// Where the MR's branch is on origin right now, without touching any local ref.
export async function remoteHead(project, branch) {
  const line = await git(project, ['ls-remote', 'origin', `refs/heads/${branch}`]);
  return line.split(/\s/)[0] || null;
}

// Where the triage fixes of an MR stand against its branch on origin:
//   none      no fixes ref (the triage changed nothing)
//   ready     the fixes sit on top of the current MR head: a plain push fast-forwards it
//   pushed    the MR branch already contains them
//   outdated  the MR branch moved since the triage: the fixes no longer apply on top of it
// `commits` (when ready) are newest first, each with the reviewer thread it fixes and whether it
// is the merge that settled the conflicts. `landed` are the fixes already on the MR branch, by
// thread, pushed together or one at a time: the commit each "fixed" reply names.
// `mr` needs { iid, source_branch }.
export async function fixesStatus(project, mr) {
  const ref = fixesRef(mr);
  const fixesSha = await git(project, ['rev-parse', '--verify', '--quiet', `refs/heads/${ref}`]).catch(() => null);
  const remoteSha = await remoteHead(project, mr.source_branch);
  const base = { ref, branch: mr.source_branch, fixesSha, remoteSha, commits: /** @type {ReturnType<typeof parseFixLog>} */ ([]), landed: /** @type {{ thread: string, sha: string }[]} */ ([]) };
  // The remote head may be commits pushed since the triage that this repo hasn't fetched yet.
  if (remoteSha && !(await succeeds(project, ['cat-file', '-e', `${remoteSha}^{commit}`]))) {
    await git(project, ['fetch', '--quiet', 'origin', `+refs/heads/${mr.source_branch}:refs/marginalia/remote/${mr.iid}`]).catch(() => null);
  }
  if (remoteSha) base.landed = landedByThread(parseFixLog(await git(project, ['log', '-n', String(LANDED_DEPTH), `--format=${FIX_LOG_FORMAT}`, remoteSha]).catch(() => '')));
  if (!fixesSha) return { ...base, state: 'none' };
  if (!remoteSha) return { ...base, state: 'outdated' };
  if (remoteSha === fixesSha || (await succeeds(project, ['merge-base', '--is-ancestor', fixesSha, remoteSha]))) return { ...base, state: 'pushed' };
  if (!(await succeeds(project, ['merge-base', '--is-ancestor', remoteSha, fixesSha]))) return { ...base, state: 'outdated' };
  const commits = parseFixLog(await git(project, ['log', `--format=${FIX_LOG_FORMAT}`, `${remoteSha}..${fixesSha}`]));
  return { ...base, state: 'ready', commits };
}

// Pushes the fixes to the MR branch, fast-forward only: checked here first for a clear
// answer, and enforced by git itself (no --force) if the branch moves in between.
export async function pushFixes(project, mr) {
  const before = await fixesStatus(project, mr);
  if (before.state !== 'ready') return { pushed: false, status: before };
  await git(project, ['push', '--quiet', 'origin', `${before.fixesSha}:refs/heads/${mr.source_branch}`]);
  return { pushed: true, status: await fixesStatus(project, mr) };
}

// Points marginalia/<slug> at the triage's fixes, for the studio to push. A triage
// that changed nothing supersedes the fixes of an earlier one: they were made on an
// older head, so the old ref is moved aside (recoverable) rather than left to push.
// Then checks the MR didn't move while the run was going: fixes made on top of an
// old head can't be pushed as they are.
export async function recordFixes(mr, baseSha) {
  const ref = `refs/heads/${fixesRef(mr)}`;
  const BOT_WORKTREE_DIR = mr.project.worktreeDir;
  const { stdout: headSha } = await execFileAsync('git', ['rev-parse', 'HEAD'], { cwd: BOT_WORKTREE_DIR });
  if (headSha.trim() !== baseSha) {
    await execFileAsync('git', ['update-ref', ref, 'HEAD'], { cwd: BOT_WORKTREE_DIR });
    log(mr, `Fixes committed locally (not pushed): push them from the studio, or git log ${fixesRef(mr)}`);
  } else {
    const { stdout: old } = await execFileAsync('git', ['rev-parse', '--verify', '--quiet', ref], { cwd: BOT_WORKTREE_DIR }).catch(() => ({ stdout: '' }));
    if (old.trim()) {
      await execFileAsync('git', ['update-ref', `refs/marginalia/superseded/${branchSlug(mr.source_branch)}`, old.trim()], { cwd: BOT_WORKTREE_DIR });
      await execFileAsync('git', ['update-ref', '-d', ref], { cwd: BOT_WORKTREE_DIR });
      log(mr, `No new fix: the previous triage's fixes are superseded (kept in refs/marginalia/superseded/${branchSlug(mr.source_branch)}).`);
    }
    return;
  }
  try {
    const remote = await remoteHead(mr.project, mr.source_branch);
    if (remote !== baseSha) warn(mr, `The MR branch moved during the triage (${baseSha.slice(0, 8)} -> ${remote?.slice(0, 8) ?? 'deleted'}): its fixes no longer apply on top of it. Re-run the triage.`);
  } catch (err) {
    warn(mr, `Could not check whether the MR branch moved during the triage: ${err.message}`);
  }
}
