import { test } from 'node:test';
import assert from 'node:assert/strict';
import { planMergeRequests, needsTriage, triageSignal, recordBelow, pruneState } from '../lib/poll-plan.mjs';

const mr = (iid, source, target, author = 'alice', sha = `sha${iid}`) => ({ iid, sha, title: `MR ${iid}`, source_branch: source, target_branch: target, author: { username: author } });
const fresh = () => ({ mineComments: {}, stackBelow: {} });
const plan = (openMrs, over = {}) => planMergeRequests({ openMrs, state: fresh(), allowedTargets: [], username: 'me', triageEnabled: true, ...over });

test('MRs by others are reviewed, mine are triaged', () => {
  const p = plan([mr(1, 'a', 'main'), mr(2, 'b', 'main', 'me')]);
  assert.deepEqual(p.reviewMrs.map((m) => m.iid), [1]);
  assert.deepEqual(p.myMrs.map((m) => m.iid), [2]);
});

test('without a triage command my own MRs are ignored', () => {
  assert.deepEqual(plan([mr(2, 'b', 'main', 'me')], { triageEnabled: false }).myMrs, []);
});

test('allowed targets look at the branch the whole stack is based on', () => {
  const open = [mr(1, 'a', 'develop'), mr(2, 'b', 'a'), mr(3, 'x', 'release')];
  assert.deepEqual(plan(open, { allowedTargets: ['develop'] }).reviewMrs.map((m) => m.iid), [1, 2]);
});

test('layers are reviewed bottom to top', () => {
  assert.deepEqual(plan([mr(3, 'c', 'b'), mr(2, 'b', 'a'), mr(1, 'a', 'main')]).reviewMrs.map((m) => m.iid), [1, 2, 3]);
});

test('a review is current at the same sha, and stale when the layer below moved', () => {
  const open = [mr(1, 'a', 'main'), mr(2, 'b', 'a')];
  const state = { 1: 'sha1', 2: 'sha2', mineComments: {}, stackBelow: { 2: 'sha1' } };
  const p = planMergeRequests({ openMrs: open, state, allowedTargets: [], username: 'me', triageEnabled: true });
  assert.equal(p.isCurrent(open[0]), true);
  assert.equal(p.isCurrent(open[1]), true);
  open[0].sha = 'moved';
  assert.equal(p.isCurrent(open[1]), false);
  assert.equal(p.isCurrent(open[0]), false);
});

test('triage needs a peer comment newer than the last one triaged', () => {
  const state = { mineComments: { 5: 't1' } };
  assert.equal(needsTriage(state, { iid: 5 }, null), false);
  assert.equal(needsTriage(state, { iid: 5 }, 't1'), false);
  assert.equal(needsTriage(state, { iid: 5 }, 't2'), true);
  assert.equal(needsTriage(state, { iid: 6 }, 't1'), true);
});

test('recordBelow stores the parent sha, or clears it for a bottom layer', () => {
  const state = fresh();
  recordBelow(state, { iid: 2 }, { sha: 'p' });
  assert.equal(state.stackBelow[2], 'p');
  recordBelow(state, { iid: 2 }, null);
  assert.equal('2' in state.stackBelow, false);
});

test('pruneState drops MRs that are no longer open, keeps the bookkeeping keys', () => {
  const state = { 1: 'a', 2: 'b', mineComments: { 7: 't', 8: 't' }, stackBelow: { 1: 'x', 2: 'y' } };
  pruneState(state, new Set(['1']), new Set(['7']));
  assert.deepEqual(state, { 1: 'a', mineComments: { 7: 't' }, stackBelow: { 1: 'x' } });
});

test('a conflict at a new head starts a triage, once; a value stored before conflicts counted reads the same', () => {
  const state = { mineComments: { 5: 't1' } };
  assert.equal(needsTriage(state, { iid: 5 }, triageSignal('t1')), false);
  assert.equal(needsTriage(state, { iid: 5 }, triageSignal('t1', 'sha1')), true);
  state.mineComments[5] = triageSignal('t1', 'sha1');
  assert.equal(needsTriage(state, { iid: 5 }, triageSignal('t1', 'sha1')), false);
  assert.equal(needsTriage(state, { iid: 5 }, triageSignal('t1')), false, 'the conflict settled and pushed: nothing new');
  assert.equal(needsTriage(state, { iid: 5 }, triageSignal('t2')), true);
  assert.equal(needsTriage({ mineComments: {} }, { iid: 6 }, triageSignal(null, 'sha9')), true);
  assert.equal(triageSignal(null), null);
});
