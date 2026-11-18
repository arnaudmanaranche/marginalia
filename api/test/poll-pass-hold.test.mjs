import { test } from 'node:test';
import assert from 'node:assert/strict';
import { heldBack } from '../dist/src/poll-pass-hold.js';

// What heldBack does with the verdict of reviewHold (the rules themselves: review-hold.test.mjs).
const DAY = 24 * 60 * 60 * 1000;
const mr = { iid: 7, author: { username: 'alice' }, project: { key: 'p' }, source_branch: 'feat-x' };
const sink = () => {
  const calls = [];
  return { calls, setMr: async (_mr, patch, entry) => calls.push([patch, entry]) };
};
const pass = (lastPushAt, over = {}) => ({ deps: { reviewFacts: async () => ({ lastPushAt, approvedBy: [] }), staleAfterDays: () => 14 }, sink: sink(), asked: null, ...over });

test('no verdict: the review goes on and its entry is left alone', async () => {
  const p = pass(Date.now() - DAY);
  assert.equal(await heldBack('review', mr, p), false);
  assert.deepEqual(p.sink.calls, []);
});

test('a verdict is the reason on the entry of that kind, as skipped', async () => {
  const p = pass(Date.now() - 20 * DAY);
  assert.equal(await heldBack('own', mr, p), true);
  assert.equal(p.sink.calls.length, 1);
  const [patch, entry] = p.sink.calls[0];
  assert.equal(patch.status, 'skipped');
  assert.match(patch.error, /No push in the last 14 days/);
  assert.equal(entry, 'own');
});
