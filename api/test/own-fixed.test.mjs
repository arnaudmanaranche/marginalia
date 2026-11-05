// An own review made again at a new commit: which findings of the old one did the push fix? Real git.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { execFileSync } from 'node:child_process';
import { mkdtemp, mkdir, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';

Object.assign(process.env, { MR_REVIEW_BOT_SKIP_CONFIG_CHECK: '1', MARGINALIA_DB: ':memory:', GITLAB_BASE_URL: 'https://g.example.com', GITLAB_USERNAME: 'me', GITLAB_TOKEN: 't', GITLAB_PROJECT_ID: 'g/p' });
const { recordFixedBefore } = await import('../dist/src/own-fixed.js');
const { getDb } = await import('../dist/src/store.js');
const { isFixed } = await import('../dist/src/fixed-store.js');

const git = (cwd, ...args) => execFileSync('git', ['-c', 'user.name=t', '-c', 'user.email=t@t', ...args], { cwd, encoding: 'utf8' }).trim();
const repo = await mkdtemp(join(tmpdir(), 'fixed-'));
git(repo, 'init', '-q');
await writeFile(join(repo, 'a.ts'), ['one', 'two', 'three', 'four', 'five', ''].join('\n'));
await writeFile(join(repo, 'b.ts'), 'untouched\n');
git(repo, 'add', '.'); git(repo, 'commit', '-q', '-m', 'A');
const A = git(repo, 'rev-parse', 'HEAD');
await writeFile(join(repo, 'a.ts'), ['one', 'two', 'THREE', 'four', 'five', ''].join('\n'));
git(repo, 'commit', '-qam', 'B');
const B = git(repo, 'rev-parse', 'HEAD');

const reviewsDir = join(repo, 'reviews');
await mkdir(reviewsDir);
const finding = (id, path, line) => ({ id, severity: 'important', title: id, path, line, body: 'b', comment: null });
await writeFile(join(reviewsDir, 'own-feat-x.findings.json'), JSON.stringify({ version: 1, source: 'json', verdict: 'REQUEST_CHANGES', summary: 's', reviewedSha: A, criticalPaths: ['Payment'], warnings: [], tour: [],
  findings: [finding('on-changed-line', 'a.ts', 3), finding('on-other-line', 'a.ts', 5), finding('other-file', 'b.ts', 1), finding('no-path', null, null)] }));
const project = { key: 'p', reviewsDir, worktreeDir: repo };

test('a push fixes the findings whose line it changed, once, and says nothing of the rest', async () => {
  assert.deepEqual(await recordFixedBefore({ project, slug: 'own-feat-x', newSha: B, iid: null }), ['on-changed-line']);
  assert.equal(isFixed(getDb(), 'p/own-feat-x:on-changed-line'), true);
  assert.equal(isFixed(getDb(), 'p/own-feat-x:on-other-line'), false);
  assert.deepEqual(await recordFixedBefore({ project, slug: 'own-feat-x', newSha: B, iid: null }), [], 'a second pass at the same commit finds nothing new');
});

test('the same commit, an unknown one, or no earlier review fixes nothing and never throws', async () => {
  assert.deepEqual(await recordFixedBefore({ project, slug: 'own-feat-x', newSha: A, iid: null }), []);
  assert.deepEqual(await recordFixedBefore({ project: { ...project, worktreeDir: await mkdtemp(join(tmpdir(), 'nogit-')) }, slug: 'own-feat-x', newSha: B, iid: null }), []);
  assert.deepEqual(await recordFixedBefore({ project, slug: 'own-never-reviewed', newSha: B, iid: null }), []);
});
