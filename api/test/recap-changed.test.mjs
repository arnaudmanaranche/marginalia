import { test } from 'node:test';
import assert from 'node:assert/strict';
import { linesChanged } from '../dist/src/recap-changed.js';
import { parseDiff } from '../dist/src/mr-diff.js';

const file = (diff, over = {}) => ({ path: 'src/a.ts', oldPath: null, status: 'modified', omitted: false, lines: parseDiff(diff), ...over });
// Old lines 10 to 15 are context; line 12 is rewritten.
const rewrite = '@@ -10,6 +10,6 @@\n ten\n eleven\n-twelve\n+twelve!\n thirteen\n fourteen\n fifteen';
const at = (files, line, path = 'src/a.ts') => linesChanged({ files, path, line });

test('a rewritten line, and the lines right around it, are changed', () => {
  assert.equal(at([file(rewrite)], 12), true);
  assert.equal(at([file(rewrite)], 14), true);
});

test('a line far from every change is not changed', () => {
  assert.equal(at([file(rewrite + '\n@@ -90,2 +90,2 @@\n-x\n+y\n z')], 40), false);
});

test('a line added just after the flagged one counts: a guard is an answer', () => {
  assert.equal(at([file('@@ -20,3 +20,4 @@\n twenty\n twenty-one\n+guard\n twenty-two')], 21), true);
});

test('a file the diff does not touch is not changed, and a deleted file is', () => {
  assert.equal(at([file(rewrite, { path: 'src/b.ts' })], 12), false);
  assert.equal(at([file('', { status: 'deleted' })], 12), true);
});

test('a renamed file is found by the path the baseline knew', () => {
  assert.equal(at([file(rewrite, { path: 'src/new.ts', oldPath: 'src/a.ts', status: 'renamed' })], 12), true);
});

test('it is null, never a guess, when it cannot be told', () => {
  assert.equal(at(null, 12), null);
  assert.equal(at([file(rewrite)], null), null);
  assert.equal(linesChanged({ files: [file(rewrite)], path: null, line: 12 }), null);
  assert.equal(at([file('', { omitted: true })], 12), null);
});

test('an addition on the first line of a hunk is anchored by its header, not by the hunk before', () => {
  const two = '@@ -1,3 +1,3 @@\n one\n-two\n+two!\n three\n@@ -60,2 +60,3 @@\n+top\n sixty\n sixty-one';
  assert.equal(at([file(two)], 61), true);
  assert.equal(at([file(two)], 20), false);
  assert.equal(at([file('@@ -5,2 +5,3 @@\n+new\n five\n six')], 5), true);
});
