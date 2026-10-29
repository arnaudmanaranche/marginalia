import { test } from 'node:test';
import assert from 'node:assert/strict';
import { buildPushes, isPushHead } from '../src/mr-pushes.mjs';

const v = (id, head, base, created_at) => ({ id, head_commit_sha: head, base_commit_sha: base, created_at });
// Newest first, as GitLab answers.
const versions = [v(3, 'h3', 'b2', '2026-10-22T10:00:00Z'), v(2, 'h2', 'b1', '2026-10-21T10:00:00Z'), v(1, 'h1', 'b1', '2026-10-20T10:00:00Z')];
const c = (id, title) => ({ id, title });
const commitsByVersion = new Map([
  [1, [c('a2', 'feat: two'), c('a1', 'feat: one')]],
  [2, [c('a3', 'fix: three'), c('a2', 'feat: two'), c('a1', 'feat: one')]],
  [3, [c('r3', 'fix: three'), c('r2', 'feat: two'), c('r1', 'feat: one')]],
]);

test('each push lists only the commits it added, oldest push first, and a new base marks a rebase', () => {
  const { pushes } = buildPushes({ versions, commitsByVersion });
  assert.deepEqual(pushes.map((p) => [p.n, p.headSha, p.commits.map((x) => x.sha), p.rebased, p.head]), [
    [1, 'h1', ['a2', 'a1'], false, false],
    [2, 'h2', ['a3'], false, false],
    [3, 'h3', ['r3', 'r2', 'r1'], true, true],
  ]);
});

test('my last review sits on the newest push before it, reading starts after it, and each report sits on the push it read', () => {
  const { pushes, defaultFrom } = buildPushes({ versions, commitsByVersion, myReviewAt: '2026-10-21T12:00:00Z', reports: [{ id: null, sha: 'h3' }, { id: 'v2', sha: 'h3' }, { id: 'v1', sha: 'h1' }, { id: 'v0', sha: null }] });
  assert.deepEqual(pushes.map((p) => p.youReviewed), [false, true, false]);
  assert.deepEqual(pushes.map((p) => p.reports), [['v1'], [], [null, 'v2']]);
  assert.equal(defaultFrom, 'h2');
});

test('with no review of mine, or one of the head, reading starts from the whole MR', () => {
  assert.equal(buildPushes({ versions, commitsByVersion }).defaultFrom, null);
  assert.equal(buildPushes({ versions, commitsByVersion, myReviewAt: '2026-10-23T00:00:00Z' }).defaultFrom, null);
  assert.equal(buildPushes({ versions, commitsByVersion, myReviewAt: '2026-10-01T00:00:00Z' }).pushes.some((p) => p.youReviewed), false);
});

test('a diff may only start from the head of one of the pushes', () => {
  assert.equal(isPushHead(versions, 'h2'), true);
  assert.equal(isPushHead(versions, 'main'), false);
});
