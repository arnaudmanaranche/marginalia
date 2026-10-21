// @ts-check
import { lstat, symlink } from 'node:fs/promises';
import { join } from 'node:path';
import { execFileAsync } from './exec.mjs';
import { BOT_CHECKOUT } from './config.mjs';
import { logger } from './logger.mjs';
import { fileExists } from './paths.mjs';

// Sets up (once) and keeps healthy a worktree of the project's repo dedicated
// to this bot, with a .claude symlink so /code-review, the code-reviewer
// agent, and the GitLab/Atlassian connectors are available in it exactly as
// in your real checkout.
export async function ensureBotWorktree(project) {
  const { repoPath: REPO_LOCAL_PATH, worktreeDir: BOT_WORKTREE_DIR } = project;
  const claudeLink = join(BOT_WORKTREE_DIR, '.claude');

  if (!(await fileExists(BOT_WORKTREE_DIR))) {
    logger.info({ project: project.key }, `Creating dedicated bot worktree at ${BOT_WORKTREE_DIR}...`);
    await execFileAsync('git', ['worktree', 'add', '--detach', BOT_WORKTREE_DIR], { cwd: REPO_LOCAL_PATH });
  }

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
    await execFileAsync('git', ['remote', 'get-url', 'origin'], { cwd: REPO_LOCAL_PATH });
  } catch {
    throw new Error(`${REPO_LOCAL_PATH} has no "origin" remote: the bot fetches merge-requests/<iid>/head from it.`);
  }

  // Clears any nested worktree entries left behind by a crashed EnterWorktree/
  // ExitWorktree cycle inside a previous run.
  await execFileAsync('git', ['worktree', 'prune'], { cwd: REPO_LOCAL_PATH });
}

// Refuses to review if the MR's branch is checked out in some other worktree
// (most likely your own day-to-day checkout) — checking it out here too would
// fail, and forcing it would be surprising for whatever has it checked out.
export async function branchCheckedOutElsewhere(project, branchName) {
  const { repoPath: REPO_LOCAL_PATH, worktreeDir: BOT_WORKTREE_DIR } = project;
  if (BOT_CHECKOUT === 'detached') return false;
  const { stdout } = await execFileAsync('git', ['worktree', 'list', '--porcelain'], { cwd: REPO_LOCAL_PATH });
  const entries = stdout.split('\n\n').map((block) => {
    const pathLine = block.match(/^worktree (.+)$/m);
    const branchLine = block.match(/^branch refs\/heads\/(.+)$/m);
    return { path: pathLine?.[1], branch: branchLine?.[1] };
  });
  return entries.some((e) => e.branch === branchName && e.path !== BOT_WORKTREE_DIR);
}

export async function checkoutMergeRequest(mr) {
  const BOT_WORKTREE_DIR = mr.project.worktreeDir;
  await execFileAsync('git', ['clean', '-fdx', '-e', '.claude'], { cwd: BOT_WORKTREE_DIR });
  await execFileAsync('git', ['fetch', '--quiet', 'origin', `merge-requests/${mr.iid}/head`], { cwd: BOT_WORKTREE_DIR });
  const checkout = BOT_CHECKOUT === 'detached' ? ['--detach', 'FETCH_HEAD'] : ['-B', mr.source_branch, 'FETCH_HEAD'];
  await execFileAsync('git', ['checkout', '--quiet', ...checkout], { cwd: BOT_WORKTREE_DIR });
  await execFileAsync('git', ['reset', '--hard', 'FETCH_HEAD'], { cwd: BOT_WORKTREE_DIR });
  await execFileAsync(
    'git',
    ['fetch', '--quiet', 'origin', `${mr.target_branch}:refs/remotes/origin/${mr.target_branch}`],
    { cwd: BOT_WORKTREE_DIR },
  );
}
