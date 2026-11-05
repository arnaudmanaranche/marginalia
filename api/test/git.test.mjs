import { test } from 'node:test';
import assert from 'node:assert/strict';
import { mkdir, readFile, writeFile } from 'node:fs/promises';
import { join } from 'node:path';
import { makeRepo } from './support/git-repo.mjs';

process.env.MR_REVIEW_BOT_SKIP_CONFIG_CHECK = '1';
process.env.MARGINALIA_GIT_NAME = 'Me';
process.env.MARGINALIA_GIT_EMAIL = 'me@worldia.com';
const { gitIn } = await import('../dist/src/git.js');
const { cleanWorktree, deleteRef, fetchMrHead, head, isAncestor, refSha, resetHard, updateRef } = await import('../dist/src/git-refs.js');
const { addWorktree, listWorktrees, worktreeTop } = await import('../dist/src/git-worktree.js');

test('run gives trimmed output, ok and exit say how it went without throwing', async () => {
  const { repo, git } = await makeRepo();
  const g = gitIn(repo);
  assert.equal(await g.run('rev-parse', 'HEAD'), git(repo, 'rev-parse', 'HEAD'));
  assert.equal(await g.ok('rev-parse', '--verify', 'nope'), false);
  assert.equal((await g.exit('rev-parse', 'HEAD')).code, 0);
  assert.notEqual((await g.exit('rev-parse', '--verify', 'nope')).code, 0);
  await assert.rejects(g.run('rev-parse', '--verify', 'nope'));
});

test('a commit is made as me, whatever git is configured with', async () => {
  const { repo } = await makeRepo();
  await writeFile(join(repo, 'b.txt'), 'b\n');
  const g = gitIn(repo);
  await g.run('add', '-A');
  await g.run('commit', '-q', '-m', 'mine');
  assert.equal(await g.run('log', '-1', '--format=%an <%ae> / %cn <%ce>'), 'Me <me@worldia.com> / Me <me@worldia.com>');
});

test('refs: where they point, moving them only when expected, and ancestry', async () => {
  const { repo, git } = await makeRepo();
  const first = await head(repo);
  assert.equal(await refSha(repo, 'refs/heads/nope'), null);
  await writeFile(join(repo, 'b.txt'), 'b\n');
  git(repo, 'add', '-A');
  git(repo, 'commit', '-qm', 'second');
  const second = await head(repo);
  assert.equal(await isAncestor(repo, first, second), true);
  assert.equal(await isAncestor(repo, second, first), false);
  await updateRef(repo, 'refs/heads/fixes', second);
  assert.equal(await refSha(repo, 'refs/heads/fixes'), second);
  await assert.rejects(updateRef(repo, 'refs/heads/fixes', first, first), 'the ref is not at `old`');
  await updateRef(repo, 'refs/heads/fixes', first, second);
  await deleteRef(repo, 'refs/heads/fixes');
  assert.equal(await refSha(repo, 'refs/heads/fixes'), null);
});

test('cleaning removes what a run left but never .claude, and a hard reset drops edits', async () => {
  const { repo } = await makeRepo();
  await mkdir(join(repo, '.claude'));
  await writeFile(join(repo, '.claude', 'keep.md'), 'x');
  await writeFile(join(repo, 'junk.txt'), 'x');
  await writeFile(join(repo, 'a.txt'), 'edited\n');
  await resetHard(repo);
  await cleanWorktree(repo);
  assert.equal(await readFile(join(repo, 'a.txt'), 'utf8'), 'a\n');
  await assert.rejects(readFile(join(repo, 'junk.txt')));
  assert.equal(await readFile(join(repo, '.claude', 'keep.md'), 'utf8'), 'x');
});

test('an MR head is fetched into FETCH_HEAD or into a named ref', async () => {
  const { repo, origin, git } = await makeRepo();
  git(origin, 'update-ref', 'refs/merge-requests/7/head', git(origin, 'rev-parse', 'feat/x'));
  await fetchMrHead(repo, 7);
  await fetchMrHead(repo, 7, 'refs/marginalia/stack/7');
  assert.equal(await refSha(repo, 'refs/marginalia/stack/7'), await head(repo));
});

test('a worktree is listed, and its top is found', async () => {
  const { repo, tmp } = await makeRepo();
  const dir = join(tmp, 'bot');
  await addWorktree(repo, dir);
  const list = await listWorktrees(repo);
  assert.equal(list.length, 2);
  assert.ok((await worktreeTop(dir))?.endsWith('bot'));
  assert.equal(await worktreeTop(tmp), null, 'a folder that is not a work tree has none');
});
