import { test } from 'node:test';
import assert from 'node:assert/strict';
import { previousFindingsPrompt } from '../src/previous-findings.mjs';

test('the previous findings are listed with their ids, for a re-run to keep them', () => {
  const text = previousFindingsPrompt([
    { id: 'modal-overflow', severity: 'major', title: 'Modal  loses\nits scroll', path: 'src/Modal.tsx', line: 12 },
    { id: 'naming', severity: 'nit', title: 'Name', path: null, line: null },
    { title: 'no id, nothing to keep' },
  ]);
  assert.match(text, /same id/);
  assert.match(text, /^- modal-overflow \(major, src\/Modal\.tsx:12\): Modal loses its scroll$/m);
  assert.match(text, /^- naming \(nit\): Name$/m);
  assert.doesNotMatch(text, /nothing to keep/);
});

test('no previous finding, nothing to say', () => {
  assert.equal(previousFindingsPrompt([]), '');
});
