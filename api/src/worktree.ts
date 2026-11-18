import { existsSync } from 'node:fs';
import { lstat, realpath, symlink } from 'node:fs/promises';
import { join } from 'node:path';
import { BOT_CHECKOUT } from './config.ts';
import { gitIn } from './git.ts';
import { cleanWorktree, fetchBranch, fetchMrHead, originUrl, resetHard } from './git-refs.ts';
import { addWorktree, listWorktrees, worktreePorcelain, worktreeTop } from './git-worktree.ts';
import { logger } from './logger.ts';
import { fileExists } from './paths.ts';
import { botWorktreeProblem, foreignWorktrees, foreignWorktreesMessage } from './worktree-guard.ts';

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

// Sets up (once) and keeps healthy a worktree of the project's repo dedicated
// to this bot, with a .claude symlink so /code-review, the code-reviewer
// agent, and the GitLab/Atlassian connectors are available in it exactly as
// in your real checkout.
export async function ensureBotWorktree(project: any) {
  const { repoPath, worktreeDir } = project;
  const claudeLink = join(worktreeDir, '.claude');

  const problem = await containerRepoProblem(repoPath);
  if (problem) throw new Error(problem);

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
  // not ours. Entries left behind by a crashed EnterWorktree cycle are only reported.
  const stale = (await listWorktrees(repoPath)).filter((w: any) => w.prunable);
  if (stale.length) logger.info({ project: project.key }, `${stale.length} stale worktree entr${stale.length === 1 ? 'y' : 'ies'} in ${repoPath} (their folders are gone). If none is on an unplugged drive, \`git worktree prune\` there clears them.`);
}

// Refuses to review if the MR's branch is checked out in some other worktree
// (most likely your own day-to-day checkout) — checking it out here too would
// fail, and forcing it would be surprising for whatever has it checked out.
export async function branchCheckedOutElsewhere(project: any, branchName: string) {
  const { repoPath, worktreeDir } = project;
  if (BOT_CHECKOUT === 'detached') return false;
  const entries = await listWorktrees(repoPath);
  return entries.some((e: any) => e.branch === branchName && e.path !== worktreeDir);
}

// `detached`: an own review only reads, and my branch is usually checked out in my own clone, so
// it never takes the branch name. A branch without an MR (mr.iid null) is fetched by its name.
export async function checkoutMergeRequest(mr: any, { detached = false }: { detached?: boolean } = {}) {
  const worktreeDir = mr.project.worktreeDir;
  await assertBotWorktree(worktreeDir);
  // A run can leave changes to tracked files (a triage whose commit failed), which
  // `git clean` does not touch and which would make the checkout below refuse.
  await resetHard(worktreeDir);
  await cleanWorktree(worktreeDir, { ignored: true });
  if (mr.iid === null) await gitIn(worktreeDir).run('fetch', '--quiet', 'origin', mr.source_branch);
  else await fetchMrHead(worktreeDir, mr.iid);
  const checkout = detached || BOT_CHECKOUT === 'detached' ? ['--detach', 'FETCH_HEAD'] : ['-B', mr.source_branch, 'FETCH_HEAD'];
  await gitIn(worktreeDir).run('checkout', '--quiet', ...checkout);
  await resetHard(worktreeDir, 'FETCH_HEAD');
  // A target branch that was rebased (a stack's lower layer) is not a fast-forward: fetched forced.
  await fetchBranch(worktreeDir, mr.target_branch, `refs/remotes/origin/${mr.target_branch}`);
}
