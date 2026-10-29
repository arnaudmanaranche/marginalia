// @ts-check
import { mkdtemp, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { execFileAsync } from './exec.mjs';
import { fixesStatus } from './fixes.mjs';
import { ownFixes } from './fixes-identity.mjs';

/** @param {string} cwd @param {string[]} args @param {Record<string, string>} [env] */
const git = (cwd, args, env = {}) => execFileAsync('git', args, { cwd, env: { ...process.env, ...env } }).then(({ stdout }) => String(stdout).trim());

// Pushes one fix of a triage alone, the one answering a given reviewer thread, so each thread can
// be answered as soon as its own fix is on the MR. The fix is replayed on the MR head in a
// throwaway worktree (its sha changes then: the reply finds it again by its thread trailer) and
// pushed fast-forward only; the fixes left are replayed on top of it, so they still sit on the
// MR head for later. The oldest fix needs no replay: it already sits on the head.
// -> { pushed, status, error? }: `error` says, in a person's words, why nothing was pushed.
export async function pushOneFix(project, mr, sha) {
  let before = await fixesStatus(project, mr);
  if (before.state !== 'ready') return { pushed: false, status: before, error: `nothing to push (${before.state})` };
  // Committed as me first (fixes-identity.mjs): the fix keeps its place in line, not its sha.
  const at = before.commits.findIndex((c) => c.sha === sha);
  if (at >= 0 && (await ownFixes(project, before))) {
    before = await fixesStatus(project, mr);
    sha = before.commits[at]?.sha ?? sha;
  }
  const oldestFirst = [...before.commits].reverse();
  const index = oldestFirst.findIndex((c) => c.sha === sha);
  if (index < 0) return { pushed: false, status: before, error: 'this commit is not one of the fixes to push' };
  const branch = `refs/heads/${mr.source_branch}`;
  if (index === 0) {
    await git(project.repoPath, ['push', '--quiet', 'origin', `${sha}:${branch}`]);
    return { pushed: true, status: await fixesStatus(project, mr) };
  }
  if (oldestFirst[0].merge) return { pushed: false, status: before, error: 'the fixes were made on top of the merge that settles the conflicts: push that one first' };

  const dir = await mkdtemp(join(tmpdir(), 'marginalia-push-'));
  const work = join(dir, 'tree');
  try {
    await git(project.repoPath, ['worktree', 'add', '--quiet', '--detach', work, String(before.remoteSha)]);
    // The commits keep their author; the committer is whoever committed them (the bot's identity),
    // since this machine may have none configured. No hook of the repo runs on the replay.
    const pick = async (commit) => {
      const [name, email] = (await git(work, ['log', '-1', '--format=%cn%x00%ce', commit])).split('\0');
      await git(work, ['-c', 'core.hooksPath=/dev/null', 'cherry-pick', '--allow-empty', commit], { GIT_COMMITTER_NAME: name, GIT_COMMITTER_EMAIL: email });
    };
    try {
      await pick(sha);
    } catch {
      return { pushed: false, status: before, error: 'this fix builds on an earlier one: push all the fixes together instead' };
    }
    await git(project.repoPath, ['push', '--quiet', 'origin', `${await git(work, ['rev-parse', 'HEAD'])}:${branch}`]);
    let note = /** @type {string | null} */ (null);
    try {
      for (const c of oldestFirst) if (c.sha !== sha) await pick(c.sha);
      // Compare-and-swap: a triage that ran meanwhile wins.
      await git(project.repoPath, ['update-ref', `refs/heads/${before.ref}`, await git(work, ['rev-parse', 'HEAD']), String(before.fixesSha)]);
    } catch {
      note = 'the other fixes no longer apply on top of this one: re-run the triage for them';
    }
    const after = await fixesStatus(project, mr);
    return { pushed: true, status: note ? { ...after, note } : after };
  } finally {
    await git(project.repoPath, ['worktree', 'remove', '--force', work]).catch(() => null);
    await rm(dir, { recursive: true, force: true });
  }
}
