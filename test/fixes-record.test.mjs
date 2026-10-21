// recordFixes after a triage: where the fixes ref ends up, and the warning when the MR branch
// moved while the triage ran. Real git repositories: a bare origin, the bot's worktree, and a
// second clone that pushes behind its back.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { mkdtemp } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { execFileSync } from 'node:child_process';

const root = await mkdtemp(join(tmpdir(), 'marginalia-record-'));
const origin = join(root, 'origin.git');
const worktree = join(root, 'worktree');
const other = join(root, 'other');
process.env.MR_REVIEW_BOT_SKIP_CONFIG_CHECK = '1';

const git = (cwd, ...args) => execFileSync('git', ['-c', 'user.name=t', '-c', 'user.email=t@t', '-c', 'commit.gpgsign=false', ...args], { cwd, encoding: 'utf8' }).trim();
git(root, 'init', '--quiet', '--bare', '-b', 'main', origin);
git(root, 'clone', '--quiet', origin, worktree);
git(worktree, 'commit', '--quiet', '--allow-empty', '-m', 'base');
git(worktree, 'push', '--quiet', 'origin', 'HEAD:refs/heads/feat/x');
git(root, 'clone', '--quiet', '-b', 'feat/x', origin, other);

const { recordFixes } = await import('../lib/fixes.mjs');
const project = { key: 'demo', repoPath: worktree, worktreeDir: worktree };
const mr = { iid: 7, source_branch: 'feat/x', title: 't', project };
const baseSha = git(worktree, 'rev-parse', 'HEAD');

function captureWarnings() {
  const lines = [];
  const original = console.warn;
  console.warn = (...args) => lines.push(args.join(' '));
  return { lines, restore: () => { console.warn = original; } };
}

test('fixes committed during the triage are kept under the fixes ref, without a warning when the branch did not move', async () => {
  git(worktree, 'commit', '--quiet', '--allow-empty', '-m', 'fix: one');
  const fixesSha = git(worktree, 'rev-parse', 'HEAD');
  const warnings = captureWarnings();
  try {
    await recordFixes(mr, baseSha);
  } finally {
    warnings.restore();
  }
  assert.equal(git(worktree, 'rev-parse', 'refs/heads/marginalia/feat-x'), fixesSha);
  assert.deepEqual(warnings.lines, []);
});

test('a branch that moved during the triage is reported, not silently ignored', async () => {
  git(other, 'commit', '--quiet', '--allow-empty', '-m', 'someone else');
  git(other, 'push', '--quiet', 'origin', 'feat/x');
  const warnings = captureWarnings();
  try {
    await recordFixes(mr, baseSha);
  } finally {
    warnings.restore();
  }
  assert.equal(warnings.lines.length, 1);
  assert.match(warnings.lines[0], /branch moved during the triage/);
  assert.doesNotMatch(warnings.lines[0], /not defined/);
});
