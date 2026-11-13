import { test } from 'node:test';
import assert from 'node:assert/strict';
import { awaitingItem, holdOf } from '../dist/src/http/reviews-awaiting.js';

const project = { key: 'p' };
const mr = (over) => ({ iid: 7, reviewPath: '/r/p/feat-x.md', title: 'Feat X', ...over });

test('an MR a poll held says why, and is not shown as queued', () => {
  const held = mr({ status: 'skipped', error: 'No push in the last 14 days.' });
  assert.equal(holdOf(held), 'No push in the last 14 days.');
  assert.equal(awaitingItem(project, held).awaiting, 'held');
  assert.equal(awaitingItem(project, held).hold, 'No push in the last 14 days.');
});

test('the budget keeps its own mark, and a pending MR is queued', () => {
  assert.equal(holdOf(mr({ status: 'skipped', held: 'budget', error: 'Budget reached' })), null);
  assert.equal(awaitingItem(project, mr({ status: 'pending' })).awaiting, 'queued');
});
