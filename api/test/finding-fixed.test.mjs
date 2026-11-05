import { test } from 'node:test';
import assert from 'node:assert/strict';
import { fixedBy, touchedRanges } from '../dist/src/finding-fixed.js';

const diff = ['diff --git a/a.ts b/a.ts', '--- a/a.ts', '+++ b/a.ts', '@@ -3 +3 @@', '-old', '+new', '@@ -10,2 +10,0 @@', '-x', '-y', '@@ -20,0 +21,2 @@', '+added', '+added'].join('\n');

test('the old lines a diff touches: a change, a deletion, and the neighbours of an insertion', () => {
  assert.deepEqual(touchedRanges(diff), [{ start: 3, end: 3 }, { start: 10, end: 11 }, { start: 20, end: 21 }]);
  assert.deepEqual(touchedRanges(''), []);
});

test('a finding is fixed when its line was touched, or when its file changed and it names no line', () => {
  assert.equal(fixedBy({ line: 3 }, diff), true);
  assert.equal(fixedBy({ line: 11 }, diff), true);
  assert.equal(fixedBy({ line: 21 }, diff), true, 'a guard added right after the line');
  assert.equal(fixedBy({ line: 4 }, diff), false, 'the next line was not touched');
  assert.equal(fixedBy({ line: 100 }, diff), false);
  assert.equal(fixedBy({}, diff), true);
  assert.equal(fixedBy({ line: 3 }, ''), false, 'nothing changed in that file');
  assert.equal(fixedBy({}, ''), false);
});
