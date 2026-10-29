import { mkdir, rename, rm } from 'node:fs/promises';
import { dirname } from 'node:path';
import { gitIn } from './git.ts';
import { fileExists } from './paths.ts';

// The git side of the team sync: clone once, then fetch and fast-forward. Every failure
// is a TeamSyncError with a `kind`, and none of them touches the last good copy.

export class TeamSyncError extends Error {
  kind: string;
  constructor(kind, message) {
    super(message);
    this.kind = kind;
  }
}

// Never wait on a credential prompt; hooks are pointless on a read-only mirror; only
// transports a team repo can reasonably use.
const GIT_ENV = { GIT_TERMINAL_PROMPT: '0', GIT_ALLOW_PROTOCOL: 'file:https:http:ssh:git' };
const git = (cwd) => gitIn(cwd, { env: GIT_ENV, hooks: false, timeout: 120_000 });
const reason = (err) => String(err.stderr || err.message).trim().split('\n')[0];

// Clones into a sibling temp folder and renames it, so teamDir is either absent or
// complete, whatever interrupts the clone.
export async function cloneTeam(url, teamDir) {
  const tmp = `${teamDir}.tmp-${process.pid}`;
  await mkdir(dirname(teamDir), { recursive: true });
  await rm(tmp, { recursive: true, force: true });
  try {
    await git(dirname(teamDir)).run('clone', '--quiet', '--', url, tmp);
    await rename(tmp, teamDir);
  } catch (err) {
    await rm(tmp, { recursive: true, force: true });
    throw new TeamSyncError('unreachable', `Could not clone ${url}: ${reason(err)}`);
  }
  return { before: null, after: await git(teamDir).run('rev-parse', 'HEAD') };
}

// Fetches and fast-forwards teamDir to its upstream. Refuses, leaving the copy as it
// was, when it has local changes or has diverged from origin.
export async function updateTeam(url, teamDir) {
  if (!(await fileExists(`${teamDir}/.git`))) {
    throw new TeamSyncError('not-a-repo', `${teamDir} exists but is not a git clone: move it away and sync again.`);
  }
  if (await git(teamDir).run('status', '--porcelain')) {
    throw new TeamSyncError('dirty', `${teamDir} has local changes: the team copy is read-only, discard them (git -C ${teamDir} checkout . && git -C ${teamDir} clean -fd).`);
  }
  if ((await git(teamDir).run('remote', 'get-url', 'origin').catch(() => '')) !== url) await git(teamDir).run('remote', 'set-url', 'origin', url);
  try {
    await git(teamDir).run('fetch', '--quiet', 'origin');
  } catch (err) {
    throw new TeamSyncError('unreachable', `Could not reach ${url}, keeping the last synced copy: ${reason(err)}`);
  }
  const before = await git(teamDir).run('rev-parse', 'HEAD');
  try {
    await git(teamDir).run('merge-base', '--is-ancestor', 'HEAD', '@{u}');
    await git(teamDir).run('merge', '--quiet', '--ff-only', '@{u}');
  } catch {
    throw new TeamSyncError('diverged', `${teamDir} cannot fast-forward to origin (local commits or rewritten history): remove it to re-clone.`);
  }
  return { before, after: await git(teamDir).run('rev-parse', 'HEAD') };
}

// Commits origin has that the copy does not, as of the last fetch (no network call).
export async function commitsBehind(teamDir) {
  try {
    return Number(await git(teamDir).run('rev-list', '--count', 'HEAD..@{u}'));
  } catch {
    return null;
  }
}
