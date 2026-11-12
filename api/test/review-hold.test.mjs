import { test } from 'node:test';
import assert from 'node:assert/strict';
import { reviewHold } from '../dist/src/review-hold.js';

const DAY = 24 * 60 * 60 * 1000;
const now = Date.parse('2026-11-12T12:00:00Z');
const hold = (over) => reviewHold({ kind: 'review', author: 'alice', staleDays: 14, now, ...over, facts: { lastPushAt: now - DAY, approvedBy: [], ...over?.facts } });

test('a recent push with no approval runs', () => {
  assert.equal(hold(), null);
});

test('no push in the stale window waits, for an own review too', () => {
  assert.match(hold({ facts: { lastPushAt: now - 15 * DAY } }), /No push in the last 14 days \(last on 2026-10-28\)/);
  assert.match(hold({ kind: 'own', facts: { lastPushAt: now - 15 * DAY } }), /No push/);
});

test('an MR with no push recorded is not stale', () => {
  assert.equal(hold({ facts: { lastPushAt: null } }), null);
});

test('an approval since the last push by someone else waits, naming them', () => {
  const at = new Date(now - DAY / 2).toISOString();
  assert.match(hold({ facts: { approvedBy: [{ username: 'bob', at }, { username: 'carol', at: null }] } }), /Approved on GitLab by bob, carol since its last push/);
});

test('an approval older than the last push, or by the author, does not hold', () => {
  assert.equal(hold({ facts: { approvedBy: [{ username: 'bob', at: new Date(now - 2 * DAY).toISOString() }, { username: 'alice', at: null }] } }), null);
});

test('an own review is never held by an approval', () => {
  assert.equal(hold({ kind: 'own', facts: { approvedBy: [{ username: 'bob', at: null }] } }), null);
});
