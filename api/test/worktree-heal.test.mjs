// A broken worktree the bot made itself is mended without a person; one a person placed is not.
// A lock a killed run left does not block the next checkout. Real temporary repositories only.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { existsSync, utimesSync } from 'node:fs';
import { mkdir, mkdtemp, readdir, realpath, rename, rm, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { git } from './support/git-repo.mjs';

process.env.MR_REVIEW_BOT_SKIP_CONFIG_CHECK = '1';
const HOME = await realpath(await mkdtemp(join(tmpdir(), 'marginalia-home-')));
process.env.MARGINALIA_HOME = HOME;
const { ownedWorktree } = await import('../dist/src/worktree-guard.js');
const { ensureBotWorktree, checkoutMergeRequest } = await import('../dist/src/worktree.js');

let n = 0;
async function setup({ owned = true } = {}) {
  n += 1;
  const root = await realpath(await mkdtemp(join(tmpdir(), 'marginalia-heal-')));
  const repo = join(root, 'repo');
  await mkdir(repo);
  git(repo, 'init', '--quiet', '-b', 'main');
  git(repo, 'commit', '--quiet', '--allow-empty', '-m', 'base');
  git(repo, 'remote', 'add', 'origin', repo);
  const worktreeDir = owned ? join(HOME, 'worktrees', `demo${n}`) : join(root, 'placed-by-a-person');
  return { root, repo, project: { key: `demo${n}`, repoPath: repo, worktreeDir } };
}

test('the bot owns the worktrees it places itself, and no other', () => {
  assert.equal(ownedWorktree('/d/worktree', '/d'), true);
  assert.equal(ownedWorktree('/d/worktrees/front', '/d/'), true);
  assert.equal(ownedWorktree('/d/worktrees/front/sub', '/d'), false);
  assert.equal(ownedWorktree('/d/worktrees', '/d'), false);
  assert.equal(ownedWorktree('/elsewhere/worktree', '/d'), false);
  assert.equal(ownedWorktree('/d/../d/worktree', '/d'), true);
});

test('its own worktree that lost its registration is set aside, not deleted, and made again', async () => {
  const { repo, project } = await setup();
  await ensureBotWorktree(project);
  await writeFile(join(project.worktreeDir, 'left.txt'), 'by a run');
  await rm(join(repo, '.git', 'worktrees'), { recursive: true });
  await ensureBotWorktree(project);
  assert.equal(await realpath(git(project.worktreeDir, 'rev-parse', '--show-toplevel')), project.worktreeDir);
  const aside = (await readdir(join(HOME, 'worktrees'))).filter((f) => f.startsWith(`${project.key}.broken-`));
  assert.equal(aside.length, 1);
  assert.ok(existsSync(join(HOME, 'worktrees', aside[0], 'left.txt')), 'what it held is kept');
});

test('its own worktree whose repository moved is repaired in place', async () => {
  const { root, repo, project } = await setup();
  await ensureBotWorktree(project);
  const moved = join(root, 'repo-moved');
  await rename(repo, moved);
  await ensureBotWorktree({ ...project, repoPath: moved });
  assert.equal(await realpath(git(project.worktreeDir, 'rev-parse', '--show-toplevel')), project.worktreeDir);
  assert.deepEqual((await readdir(join(HOME, 'worktrees'))).filter((f) => f.startsWith(`${project.key}.broken-`)), []);
});

test('a worktree a person placed is still refused, never set aside', async () => {
  const { repo, project } = await setup({ owned: false });
  await ensureBotWorktree(project);
  await rm(join(repo, '.git', 'worktrees'), { recursive: true });
  await assert.rejects(ensureBotWorktree(project), /not a working git worktree/);
  assert.ok(existsSync(project.worktreeDir));
});

test('an old index.lock a killed run left does not block the checkout; a fresh one is left alone', async () => {
  const { repo, project } = await setup();
  git(repo, 'update-ref', 'refs/merge-requests/1/head', 'main');
  await ensureBotWorktree(project);
  const lock = join(git(project.worktreeDir, 'rev-parse', '--absolute-git-dir'), 'index.lock');
  const mr = { iid: 1, source_branch: 'feat/mr', target_branch: 'main', project };
  await writeFile(lock, '');
  await assert.rejects(checkoutMergeRequest(mr), /index\.lock/);
  const old = (Date.now() - 10 * 60_000) / 1000;
  utimesSync(lock, old, old);
  await checkoutMergeRequest(mr);
  assert.ok(!existsSync(lock));
});
