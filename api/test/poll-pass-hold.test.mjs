import { test } from 'node:test';
import assert from 'node:assert/strict';
import { heldBack } from '../dist/src/poll-pass-hold.js';

const DAY = 24 * 60 * 60 * 1000;
const mr = { iid: 7, author: { username: 'alice' }, project: { key: 'p' }, source_branch: 'feat-x' };
const sink = () => {
  const calls = [];
  return { calls, setMr: async (_mr, patch) => calls.push(patch) };
};

test('without a stale limit, an old push does not hold the review, an approval since still does', async () => {
  const old = { lastPushAt: Date.now() - 400 * DAY, approvedBy: [] };
  const s = sink();
  assert.equal(await heldBack('review', mr, { deps: { reviewFacts: async () => old }, sink: s, asked: null }), false);
  const approved = { lastPushAt: Date.now() - DAY, approvedBy: [{ username: 'bob', at: new Date().toISOString() }] };
  assert.equal(await heldBack('review', mr, { deps: { reviewFacts: async () => approved }, sink: s, asked: null }), true);
  assert.equal(s.calls[0].status, 'skipped');
});
