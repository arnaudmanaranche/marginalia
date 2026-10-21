// The bot's worktree safety rules, on real temporary git repositories (never anyone's real one):
// no automatic prune, no `git clean` anywhere but in a worktree of its own, and a container that
// refuses a checkout whose worktrees it cannot see.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { existsSync } from 'node:fs';
import { mkdtemp, mkdir, rm, writeFile, realpath } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { execFileSync } from 'node:child_process';

process.env.MR_REVIEW_BOT_SKIP_CONFIG_CHECK = '1';
const { parseWorktrees, foreignWorktrees, botWorktreeProblem } = await import('../lib/worktree-guard.mjs');
const { ensureBotWorktree, assertBotWorktree, checkoutMergeRequest } = await import('../lib/worktree.mjs');

const git = (cwd, ...args) => execFileSync('git', ['-c', 'user.name=t', '-c', 'user.email=t@t', '-c', 'commit.gpgsign=false', ...args], { cwd, encoding: 'utf8' }).trim();
async function repoWithWorktree() {
  const root = await realpath(await mkdtemp(join(tmpdir(), 'marginalia-wt-')));
  const repo = join(root, 'repo');
  await mkdir(repo);
  git(repo, 'init', '--quiet', '-b', 'main');
  git(repo, 'commit', '--quiet', '--allow-empty', '-m', 'base');
  git(repo, 'remote', 'add', 'origin', 'https://git.example.com/g/demo.git');
  return { root, repo, project: { key: 'demo', repoPath: repo, worktreeDir: join(root, 'bot-worktree') } };
}

const PORCELAIN = [
  'worktree /host/repo\nHEAD aaa\nbranch refs/heads/main',
  'worktree /host/repo/.claude/worktrees/x\nHEAD bbb\nbranch refs/heads/feat/x\nprunable gitdir file points to non-existent location',
  'worktree /here/bot\nHEAD ccc\ndetached',
].join('\n\n');

test('the worktree list is read, with the prunable ones marked', () => {
  assert.deepEqual(parseWorktrees(PORCELAIN).map((w) => [w.path, w.branch, w.prunable]), [
    ['/host/repo', 'main', false], ['/host/repo/.claude/worktrees/x', 'feat/x', true], ['/here/bot', null, false],
  ]);
});

test('foreign worktrees are the other ones whose folder cannot be seen from here', () => {
  const seen = new Set(['/host/repo', '/here/bot']);
  assert.deepEqual(foreignWorktrees(PORCELAIN, (p) => seen.has(p)).map((w) => w.path), ['/host/repo/.claude/worktrees/x']);
  assert.deepEqual(foreignWorktrees(PORCELAIN, () => true), []);
});

test('only a folder that git calls the top of its own work tree may be cleaned', () => {
  assert.equal(botWorktreeProblem('/a/wt', '/a/wt'), null);
  assert.match(botWorktreeProblem('/a/wt', null), /not a working git worktree/);
  assert.match(botWorktreeProblem('/a/wt', '/a'), /would clean \/a/);
});

test('a real worktree passes the check', async () => {
  const { repo, project } = await repoWithWorktree();
  git(repo, 'worktree', 'add', '--quiet', '--detach', project.worktreeDir);
  await assertBotWorktree(project.worktreeDir);
});

test('a folder that is only inside another repository is refused, and nothing in that repository is cleaned', async () => {
  const { repo } = await repoWithWorktree();
  const inside = join(repo, 'webapp-worktree');
  await mkdir(inside);
  await writeFile(join(repo, '.env'), 'SECRET=1');
  await writeFile(join(repo, '.gitignore'), '.env\n');
  await assert.rejects(checkoutMergeRequest({ iid: 1, source_branch: 'x', target_branch: 'main', project: { worktreeDir: inside } }), /would clean/);
  assert.ok(existsSync(join(repo, '.env')), 'the ignored file survived');
});

test('a worktree whose registration was lost is refused rather than cleaned or used', async () => {
  const { repo, project } = await repoWithWorktree();
  git(repo, 'worktree', 'add', '--quiet', '--detach', project.worktreeDir);
  await writeFile(join(project.worktreeDir, 'keep.txt'), 'mine');
  await rm(join(repo, '.git', 'worktrees'), { recursive: true });
  await assert.rejects(ensureBotWorktree(project), /not a working git worktree/);
  assert.ok(existsSync(join(project.worktreeDir, 'keep.txt')));
});

test('the bot never prunes: a worktree entry whose folder is gone is still registered afterwards', async () => {
  const { repo, project, root } = await repoWithWorktree();
  const other = join(root, 'someone-elses-worktree');
  git(repo, 'worktree', 'add', '--quiet', '--detach', other);
  await rm(other, { recursive: true });
  assert.match(git(repo, 'worktree', 'list'), /someone-elses-worktree/);
  await ensureBotWorktree(project);
  assert.match(git(repo, 'worktree', 'list'), /someone-elses-worktree/, 'still registered');
  assert.match(git(repo, 'worktree', 'list'), /bot-worktree/, 'and the bot got its own');
});

test('in the container a checkout with worktrees it cannot see is refused, and left exactly as it was', async () => {
  const { repo, project, root } = await repoWithWorktree();
  const hostOnly = join(root, 'host-only-worktree');
  git(repo, 'worktree', 'add', '--quiet', '--detach', hostOnly);
  await rm(hostOnly, { recursive: true }); // what the container sees of a host path
  const before = git(repo, 'worktree', 'list');
  process.env.MARGINALIA_CONTAINER = '1';
  try {
    await assert.rejects(ensureBotWorktree(project), /dedicated clone/);
  } finally {
    delete process.env.MARGINALIA_CONTAINER;
  }
  assert.equal(git(repo, 'worktree', 'list'), before, 'nothing was added or removed');
  assert.ok(!existsSync(project.worktreeDir));
});
