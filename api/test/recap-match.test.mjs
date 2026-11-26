import { test } from 'node:test';
import assert from 'node:assert/strict';
import { matchFindings, overlap } from '../dist/src/recap-match.js';

const f = (id, title, path = 'src/a.ts') => ({ id, title, path });

test('a finding that keeps its id is kept, whatever its title says now', () => {
  const now = f('x', 'Something else entirely');
  const m = matchFindings([f('x', 'Total goes negative')], [now]);
  assert.deepEqual(m.kept, [now]);
  assert.equal(m.added.length + m.gone.length + m.reworded.length, 0);
});

test('a new id in the same file with most of the title is the same finding', () => {
  const m = matchFindings([f('a', 'cart total goes negative with coupon')], [f('b', 'cart total negative with a coupon applied')]);
  assert.deepEqual(m.kept.map((k) => k.id), ['b']);
  assert.equal(m.gone.length + m.added.length, 0);
});

test('a weaker overlap is a reworded pair, not one gone and one new', () => {
  const was = f('a', 'cart total goes negative with coupon');
  const now = f('b', 'coupon makes total wrong later');
  assert.ok(overlap(was, now) >= 0.3 && overlap(was, now) < 0.5);
  const m = matchFindings([was], [now]);
  assert.deepEqual(m.reworded, [{ was, now }]);
  assert.equal(m.kept.length + m.added.length + m.gone.length, 0);
});

test('another file never matches, so it is one gone and one new', () => {
  const m = matchFindings([f('a', 'cart total goes negative', 'src/a.ts')], [f('b', 'cart total goes negative', 'src/b.ts')]);
  assert.equal(m.added.length, 1);
  assert.equal(m.gone.length, 1);
});

test('one earlier finding is matched once, by the closest current finding whatever the order', () => {
  const was = f('a', 'cart total goes negative with coupon');
  const weaker = f('b', 'cart total wrong somewhere else'); // 2 of 5 words: only a reworded candidate, and the earlier finding is gone by then
  const near = f('c', 'cart total goes negative now'); // 4 of 5 words: the closest
  const middling = f('d', 'cart total goes wrong again'); // 3 of 5 words: first in the list, but not the closest
  const m = matchFindings([was], [middling, weaker, near]);
  assert.deepEqual(m.kept.map((k) => k.id), ['c']);
  assert.deepEqual(m.added.map((k) => k.id).sort(), ['b', 'd']);
});

test('two findings without a file are never matched on their titles', () => {
  const m = matchFindings([f('a', 'cart total goes negative', null)], [f('b', 'cart total goes negative', null)]);
  assert.equal(m.added.length, 1);
  assert.equal(m.gone.length, 1);
});

test('no words to compare means no match', () => {
  assert.equal(overlap(f('a', 'a b'), f('b', 'a b')), 0);
});
