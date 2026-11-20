import { existsSync } from 'node:fs';
import { lstat, realpath, rename, rm, stat, symlink } from 'node:fs/promises';
import { join } from 'node:path';
import { DATA_DIR } from './config.ts';
import { gitIn } from './git.ts';
import { cleanWorktree, fetchBranch, fetchMrHead, originUrl, resetHard } from './git-refs.ts';
import { addWorktree, listWorktrees, worktreePorcelain, worktreeTop } from './git-worktree.ts';
import { logger } from './logger.ts';
import { fileExists } from './paths.ts';
import { sweepScratchWorktrees } from './scratch-worktree.ts';
import { botWorktreeProblem, foreignWorktrees, foreignWorktreesMessage, ownedWorktree } from './worktree-guard.ts';

// In the container image: the reason this repo cannot be worked in from here, or null.
export async function containerRepoProblem(repoPath: string) {
  if (process.env.MARGINALIA_CONTAINER !== '1') return null;
  const foreign = foreignWorktrees(await worktreePorcelain(repoPath), existsSync);
  return foreign.length ? foreignWorktreesMessage(repoPath, foreign) : null;
}

// Throws unless `dir` is a git worktree of its own (see worktree-guard.ts).
export async function assertBotWorktree(dir: string) {
  const top = await worktreeTop(dir);
  const problem = botWorktreeProblem(await realpath(dir), top && (await realpath(top)));
  if (problem) throw new Error(problem);
}

// A worktree of the bot's own, back at `ref` with nothing a run left: checked first, since a folder
// that lost its registration would force and clean whatever repository git finds above it.
export async function resetWorktreeTo(dir: string, ref: string) {
  await assertBotWorktree(dir);
  await gitIn(dir).run('checkout', '--quiet', '--detach', '--force', ref);
  await cleanWorktree(dir, { ignored: true });
}

// A broken worktree the bot made itself (ownedWorktree) is mended without a person: `git worktree
// repair` when only its links are off (the data dir moved), else the folder is set aside, never
// deleted, and the caller makes a new one. One a person placed is left to the refusal it gets.
async function healOwnWorktree({ key, repoPath, worktreeDir }: any) {
  const healthy = () => assertBotWorktree(worktreeDir).then(() => true, () => false);
  if ((await healthy()) || !ownedWorktree(worktreeDir, DATA_DIR)) return;
  await gitIn(repoPath).run('worktree', 'repair', worktreeDir).catch(() => null);
  if (await healthy()) return logger.info({ project: key }, `Repaired the links of the bot worktree at ${worktreeDir}.`);
  const aside = `${worktreeDir}.broken-${Date.now()}`;
  await rename(worktreeDir, aside);
  logger.warn({ project: key }, `The bot worktree at ${worktreeDir} had lost its registration: set aside at ${aside} (delete it when you like), a new one is made.`);
}

// Only the task of the project's lane works in its worktree, so an index.lock older than any git
// command takes is one a killed run left; it would make every later checkout refuse.
const STALE_LOCK_MS = 2 * 60_000;
async function clearStaleIndexLock(dir: string, now = Date.now()) {
  const lock = join(await gitIn(dir).run('rev-parse', '--absolute-git-dir'), 'index.lock');
  const age = await stat(lock).then((s) => now - s.mtimeMs, () => null);
  if (age !== null && age > STALE_LOCK_MS) {
    await rm(lock, { force: true });
    logger.warn(`Removed ${lock}, left by a stopped run.`);
  }
}

// Sets up (once) and keeps healthy a worktree of the project's repo dedicated
// to this bot, with a .claude symlink so /code-review, the code-reviewer
// agent, and the GitLab/Atlassian connectors are available in it exactly as
// in your real checkout.
export async function ensureBotWorktree(project: any) {
  const { repoPath, worktreeDir } = project;
  const claudeLink = join(worktreeDir, '.claude');

  const problem = await containerRepoProblem(repoPath);
  if (problem) throw new Error(problem);

  if (await fileExists(worktreeDir)) await healOwnWorktree(project);
  if (!(await fileExists(worktreeDir))) {
    logger.info({ project: project.key }, `Creating dedicated bot worktree at ${worktreeDir}...`);
    await addWorktree(repoPath, worktreeDir);
  }
  await assertBotWorktree(worktreeDir);

  let linkOk = false;
  try {
    const s = await lstat(claudeLink);
    linkOk = s.isSymbolicLink();
  } catch {
    linkOk = false;
  }
  if (!linkOk) {
    const repoClaude = join(repoPath, '.claude');
    if (await fileExists(repoClaude)) {
      // A real folder already there (not ours to delete) must not stop the bot: it only loses the repo's settings.
      await symlink(repoClaude, claudeLink, 'dir').catch((err) => logger.warn({ project: project.key, err }, `${claudeLink} exists and is not a link to ${repoClaude}: the bot runs without the repo's .claude/.`));
    } else {
      logger.info({ project: project.key }, `No .claude/ in ${repoPath}: no code-reviewer checklist nor repo settings for the bot.`);
    }
  }

  try {
    await originUrl(repoPath);
  } catch {
    throw new Error(`${repoPath} has no "origin" remote: the bot fetches merge-requests/<iid>/head from it.`);
  }

  // Never `git worktree prune` here: it deletes the registration of every worktree whose folder is
  // not visible right now (an unplugged drive, another mount of this repo), including ones that are
  // not ours. Only the bot's own scratch worktrees a crash left are removed, one by one; any other
  // stale entry is only reported.
  const swept = await sweepScratchWorktrees(repoPath);
  if (swept.length) logger.info({ project: project.key }, `Removed ${swept.length} scratch worktree(s) a stopped run left in ${repoPath}.`);
  const stale = (await listWorktrees(repoPath)).filter((w: any) => w.prunable);
  if (stale.length) logger.info({ project: project.key }, `${stale.length} stale worktree entr${stale.length === 1 ? 'y' : 'ies'} in ${repoPath} (their folders are gone). If none is on an unplugged drive, \`git worktree prune\` there clears them.`);
}

// The MR's head, detached (ADR 0011): the worktree shares its refs with the repo a person works in,
// so the bot never takes, moves or commits on a local branch of theirs. A triage's fixes go to
// marginalia/<slug> instead (fixes.ts). A branch without an MR (mr.iid null) is fetched by its name.
export async function checkoutMergeRequest(mr: any) {
  const worktreeDir = mr.project.worktreeDir;
  await assertBotWorktree(worktreeDir);
  await clearStaleIndexLock(worktreeDir);
  // A run can leave changes to tracked files (a triage whose commit failed), which
  // `git clean` does not touch and which would make the checkout below refuse.
  await resetHard(worktreeDir);
  await cleanWorktree(worktreeDir, { ignored: true });
  if (mr.iid === null) await gitIn(worktreeDir).run('fetch', '--quiet', 'origin', mr.source_branch);
  else await fetchMrHead(worktreeDir, mr.iid);
  await gitIn(worktreeDir).run('checkout', '--quiet', '--detach', 'FETCH_HEAD');
  await resetHard(worktreeDir, 'FETCH_HEAD');
  // A target branch that was rebased (a stack's lower layer) is not a fast-forward: fetched forced.
  await fetchBranch(worktreeDir, mr.target_branch, `refs/remotes/origin/${mr.target_branch}`);
}
