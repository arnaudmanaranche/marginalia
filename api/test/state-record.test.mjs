import { test } from 'node:test';
import assert from 'node:assert/strict';

process.env.MARGINALIA_DB = ':memory:';
const { loadState, recordReviewedHead, saveState } = await import('../dist/src/state.js');

const project = { key: 'p' };

test('a review outside a poll records its head and keeps the rest of the state', async () => {
  await saveState(project, { 1: 'old', mineComments: { 2: 'x|' }, stackBelow: { 1: 'below' } });
  await recordReviewedHead(project, 1, 'new');
  assert.deepEqual(await loadState(project), { 1: 'new', mineComments: { 2: 'x|' }, stackBelow: { 1: 'below' } });
});
