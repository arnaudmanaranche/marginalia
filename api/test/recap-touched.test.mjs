import { test } from 'node:test';
import assert from 'node:assert/strict';
import { onChangedCode } from '../dist/src/recap-touched.js';
import { parseDiff } from '../dist/src/mr-diff.js';

const file = (diff, over = {}) => ({ path: 'src/a.ts', oldPath: null, status: 'modified', omitted: false, lines: parseDiff(diff), ...over });
// New lines 10 to 15 are context; line 12 is rewritten.
const rewrite = '@@ -10,6 +10,6 @@\n ten\n eleven\n-twelve\n+twelve!\n thirteen\n fourteen\n fifteen';
const on = (files, line, path = 'src/a.ts') => onChangedCode({ files, path, line });

test('a finding on a rewritten line, or right around it, is on changed code', () => {
  assert.equal(on([file(rewrite)], 12), true);
  assert.equal(on([file(rewrite)], 15), true);
});

test('a finding far from every change is on older code', () => {
  assert.equal(on([file(rewrite)], 60), false);
});

test('a finding in a file the diff does not touch is on older code', () => {
  assert.equal(on([file(rewrite, { path: 'src/b.ts' })], 12), false);
});

test('a finding in a file added since the baseline is on changed code', () => {
  assert.equal(on([file('@@ -0,0 +1,3 @@\n+a\n+b\n+c', { status: 'added' })], 2), true);
});

test('a finding next to a pure deletion is on changed code: something was removed there', () => {
  const removal = '@@ -30,3 +29,0 @@\n-x\n-y\n-z';
  assert.equal(on([file(removal)], 30), true);
  assert.equal(on([file(removal)], 34), false);
});

test('a finding on the first line of a hunk is anchored by its header, not by the hunk before', () => {
  const two = '@@ -1,3 +1,3 @@\n one\n-two\n+two!\n three\n@@ -60,2 +60,3 @@\n+top\n sixty\n sixty-one';
  assert.equal(on([file(two)], 61), true);
  assert.equal(on([file(two)], 20), false);
});

test('it is null, never a guess, when it cannot be told', () => {
  assert.equal(on(null, 12), null);
  assert.equal(on([file(rewrite)], null), null);
  assert.equal(onChangedCode({ files: [file(rewrite)], path: null, line: 12 }), null);
  assert.equal(on([file('', { omitted: true })], 12), null);
});

test('the line is read on the new side: a hunk that moved down is found at its new numbers, not the old', () => {
  const moved = '@@ -10,3 +20,3 @@\n ten\n-eleven\n+eleven!\n twelve';
  assert.equal(on([file(moved)], 21), true);
  assert.equal(on([file(moved)], 11), false);
});

test('an added file is on changed code even when its diff was left out', () => {
  assert.equal(on([file('', { status: 'added', omitted: true })], 5), true);
});

test('an empty diff is a diff with no change, so older code; no diff at all is null', () => {
  assert.equal(on([], 12), false);
  assert.equal(on(null, 12), null);
});
