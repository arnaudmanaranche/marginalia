import { test } from 'node:test';
import assert from 'node:assert/strict';
import { matchFindings, overlap } from '../dist/src/recap-match.js';

const f = (id, title, path = 'src/a.ts') => ({ id, title, path });

test('a finding that keeps its id is kept, whatever its title says now', () => {
  const m = matchFindings([f('x', 'Total goes negative')], [f('x', 'Something else entirely')]);
  assert.equal(m.kept.length, 1);
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

test('one earlier finding is matched once: the closest current finding takes it', () => {
  const m = matchFindings([f('a', 'cart total goes negative')], [f('b', 'cart total goes negative'), f('c', 'cart total goes negative too')]);
  assert.equal(m.kept.length, 1);
  assert.equal(m.added.length, 1);
});

test('no words to compare means no match', () => {
  assert.equal(overlap(f('a', 'a b'), f('b', 'a b')), 0);
});
