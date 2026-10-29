import { gitIn } from './git.ts';
import { deleteRef, fetchBranch, head, isAncestor, pushTo, refSha, remoteHead, updateRef } from './git-refs.ts';
import { log, warn } from './log.ts';
import { branchSlug, fixesRef } from './paths.ts';
import { ownFixes } from './fixes-identity.ts';
import { FIX_LOG_FORMAT, landedByThread, parseFixLog } from './fixes-log.ts';

// How far down the MR branch a pushed fix is looked for.
const LANDED_DEPTH = 200;

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
  const cwd = project.repoPath;
  const git = gitIn(cwd);
  const fixesSha = await refSha(cwd, `refs/heads/${ref}`);
  const remoteSha = await remoteHead(cwd, mr.source_branch);
  const base = { ref, branch: mr.source_branch, fixesSha, remoteSha, commits: [] as ReturnType<typeof parseFixLog>, landed: [] as { thread: string; sha: string }[] };
  // The remote head may be commits pushed since the triage that this repo hasn't fetched yet.
  if (remoteSha && !(await git.ok('cat-file', '-e', `${remoteSha}^{commit}`))) {
    await fetchBranch(cwd, `refs/heads/${mr.source_branch}`, `refs/marginalia/remote/${mr.iid}`).catch(() => null);
  }
  if (remoteSha) base.landed = landedByThread(parseFixLog(await git.run('log', '-n', String(LANDED_DEPTH), `--format=${FIX_LOG_FORMAT}`, remoteSha).catch(() => '')));
  if (!fixesSha) return { ...base, state: 'none' };
  if (!remoteSha) return { ...base, state: 'outdated' };
  if (remoteSha === fixesSha || (await isAncestor(cwd, fixesSha, remoteSha))) return { ...base, state: 'pushed' };
  if (!(await isAncestor(cwd, remoteSha, fixesSha))) return { ...base, state: 'outdated' };
  const commits = parseFixLog(await git.run('log', `--format=${FIX_LOG_FORMAT}`, `${remoteSha}..${fixesSha}`));
  return { ...base, state: 'ready', commits };
}

// Pushes the fixes to the MR branch, fast-forward only: checked here first for a clear
// answer, and enforced by git itself (no --force) if the branch moves in between. They go up
// committed as me (fixes-identity.ts).
export async function pushFixes(project, mr) {
  let before = await fixesStatus(project, mr);
  if (before.state !== 'ready') return { pushed: false, status: before };
  if (await ownFixes(project, before)) before = await fixesStatus(project, mr);
  await pushTo(project.repoPath, before.fixesSha, mr.source_branch);
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
  if ((await head(BOT_WORKTREE_DIR)) !== baseSha) {
    await updateRef(BOT_WORKTREE_DIR, ref, 'HEAD');
    log(mr, `Fixes committed locally (not pushed): push them from the studio, or git log ${fixesRef(mr)}`);
  } else {
    const old = await refSha(BOT_WORKTREE_DIR, ref);
    if (old) {
      await updateRef(BOT_WORKTREE_DIR, `refs/marginalia/superseded/${branchSlug(mr.source_branch)}`, old);
      await deleteRef(BOT_WORKTREE_DIR, ref);
      log(mr, `No new fix: the previous triage's fixes are superseded (kept in refs/marginalia/superseded/${branchSlug(mr.source_branch)}).`);
    }
    return;
  }
  try {
    const remote = await remoteHead(mr.project.repoPath, mr.source_branch);
    if (remote !== baseSha) warn(mr, `The MR branch moved during the triage (${baseSha.slice(0, 8)} -> ${remote?.slice(0, 8) ?? 'deleted'}): its fixes no longer apply on top of it. Re-run the triage.`);
  } catch (err) {
    warn(mr, `Could not check whether the MR branch moved during the triage: ${err.message}`);
  }
}
