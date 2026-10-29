// @ts-check
import { existsSync } from 'node:fs';
import { lstat, realpath, symlink } from 'node:fs/promises';
import { join } from 'node:path';
import { BOT_CHECKOUT } from './config.mjs';
import { gitIn } from './git.mjs';
import { cleanWorktree, fetchBranch, fetchMrHead, originUrl, resetHard } from './git-refs.mjs';
import { addWorktree, listWorktrees, worktreePorcelain, worktreeTop } from './git-worktree.mjs';
import { logger } from './logger.mjs';
import { fileExists } from './paths.mjs';
import { botWorktreeProblem, foreignWorktrees, foreignWorktreesMessage } from './worktree-guard.mjs';

// In the container image: the reason this repo cannot be worked in from here, or null.
export async function containerRepoProblem(repoPath) {
  if (process.env.MARGINALIA_CONTAINER !== '1') return null;
  const foreign = foreignWorktrees(await worktreePorcelain(repoPath), existsSync);
  return foreign.length ? foreignWorktreesMessage(repoPath, foreign) : null;
}

// Throws unless `dir` is a git worktree of its own (see worktree-guard.mjs).
export async function assertBotWorktree(dir) {
  const top = await worktreeTop(dir);
  const problem = botWorktreeProblem(await realpath(dir), top && (await realpath(top)));
  if (problem) throw new Error(problem);
}

// Sets up (once) and keeps healthy a worktree of the project's repo dedicated
// to this bot, with a .claude symlink so /code-review, the code-reviewer
// agent, and the GitLab/Atlassian connectors are available in it exactly as
// in your real checkout.
export async function ensureBotWorktree(project) {
  const { repoPath: REPO_LOCAL_PATH, worktreeDir: BOT_WORKTREE_DIR } = project;
  const claudeLink = join(BOT_WORKTREE_DIR, '.claude');

  const problem = await containerRepoProblem(REPO_LOCAL_PATH);
  if (problem) throw new Error(problem);

  if (!(await fileExists(BOT_WORKTREE_DIR))) {
    logger.info({ project: project.key }, `Creating dedicated bot worktree at ${BOT_WORKTREE_DIR}...`);
    await addWorktree(REPO_LOCAL_PATH, BOT_WORKTREE_DIR);
  }
  await assertBotWorktree(BOT_WORKTREE_DIR);

  let linkOk = false;
  try {
    const s = await lstat(claudeLink);
    linkOk = s.isSymbolicLink();
  } catch {
    linkOk = false;
  }
  if (!linkOk) {
    const repoClaude = join(REPO_LOCAL_PATH, '.claude');
    if (await fileExists(repoClaude)) {
      await symlink(repoClaude, claudeLink, 'dir');
    } else {
      logger.info({ project: project.key }, `No .claude/ in ${REPO_LOCAL_PATH}: only user-level commands/agents (~/.claude) will be available to the bot.`);
    }
  }

  try {
    await originUrl(REPO_LOCAL_PATH);
  } catch {
    throw new Error(`${REPO_LOCAL_PATH} has no "origin" remote: the bot fetches merge-requests/<iid>/head from it.`);
  }

  // Never `git worktree prune` here: it deletes the registration of every worktree whose folder is
  // not visible right now (an unplugged drive, another mount of this repo), including ones that are
  // not ours. Entries left behind by a crashed EnterWorktree cycle are only reported.
  const stale = (await listWorktrees(REPO_LOCAL_PATH)).filter((w) => w.prunable);
  if (stale.length) logger.info({ project: project.key }, `${stale.length} stale worktree entr${stale.length === 1 ? 'y' : 'ies'} in ${REPO_LOCAL_PATH} (their folders are gone). If none is on an unplugged drive, \`git worktree prune\` there clears them.`);
}

// Refuses to review if the MR's branch is checked out in some other worktree
// (most likely your own day-to-day checkout) — checking it out here too would
// fail, and forcing it would be surprising for whatever has it checked out.
export async function branchCheckedOutElsewhere(project, branchName) {
  const { repoPath: REPO_LOCAL_PATH, worktreeDir: BOT_WORKTREE_DIR } = project;
  if (BOT_CHECKOUT === 'detached') return false;
  const entries = await listWorktrees(REPO_LOCAL_PATH);
  return entries.some((e) => e.branch === branchName && e.path !== BOT_WORKTREE_DIR);
}

export async function checkoutMergeRequest(mr) {
  const BOT_WORKTREE_DIR = mr.project.worktreeDir;
  await assertBotWorktree(BOT_WORKTREE_DIR);
  // A run can leave changes to tracked files (a triage whose commit failed), which
  // `git clean` does not touch and which would make the checkout below refuse.
  await resetHard(BOT_WORKTREE_DIR);
  await cleanWorktree(BOT_WORKTREE_DIR, { ignored: true });
  await fetchMrHead(BOT_WORKTREE_DIR, mr.iid);
  const checkout = BOT_CHECKOUT === 'detached' ? ['--detach', 'FETCH_HEAD'] : ['-B', mr.source_branch, 'FETCH_HEAD'];
  await gitIn(BOT_WORKTREE_DIR).run('checkout', '--quiet', ...checkout);
  await resetHard(BOT_WORKTREE_DIR, 'FETCH_HEAD');
  // A target branch that was rebased (a stack's lower layer) is not a fast-forward: fetched forced.
  await fetchBranch(BOT_WORKTREE_DIR, mr.target_branch, `refs/remotes/origin/${mr.target_branch}`);
}
