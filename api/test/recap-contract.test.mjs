import { test } from 'node:test';
import assert from 'node:assert/strict';
import { RecapComment, RecapFinding, RecapCounts } from '@worldia/marginalia-contract';

const signals = { linesChanged: null, replied: false, resolved: false };
const comment = (over = {}) => ({ findingId: 'x', title: 't', path: 'src/a.ts', line: 3, standing: 'untouched', signals, disagreement: false, url: null, ...over });
const finding = (over = {}) => ({ id: 'x', title: 't', severity: null, path: 'src/a.ts', line: 3, onChangedCode: null, ...over });

test('a location is a path, or a path and a line: never a line alone, never line 0', () => {
  assert.ok(RecapComment.safeParse(comment()).success);
  assert.ok(RecapComment.safeParse(comment({ line: null })).success);
  assert.ok(RecapComment.safeParse(comment({ path: null, line: null })).success);
  assert.equal(RecapComment.safeParse(comment({ path: null })).success, false);
  assert.equal(RecapComment.safeParse(comment({ line: 0 })).success, false);
  assert.ok(RecapFinding.safeParse(finding()).success);
  assert.equal(RecapFinding.safeParse(finding({ path: null })).success, false);
});

test('a count is never negative', () => {
  const counts = { addressed: 0, contested: 0, untouched: 0, dropped: 0, newFindings: 0, reworded: 0, gone: 0 };
  assert.ok(RecapCounts.safeParse(counts).success);
  assert.equal(RecapCounts.safeParse({ ...counts, gone: -1 }).success, false);
});

test('an id is one the posting endpoints accept', () => {
  assert.equal(RecapComment.safeParse(comment({ findingId: 'has space' })).success, false);
  assert.equal(RecapComment.safeParse(comment({ findingId: 'a'.repeat(65) })).success, false);
  assert.equal(RecapFinding.safeParse(finding({ id: '' })).success, false);
  assert.ok(RecapFinding.safeParse(finding({ id: 'neg-total_2' })).success);
});

test('a comment on the whole file or MR cannot claim to know whether its code changed', () => {
  assert.equal(RecapComment.safeParse(comment({ line: null, signals: { ...signals, linesChanged: true } })).success, false);
  assert.ok(RecapComment.safeParse(comment({ line: null, signals })).success);
});

test('a finding without a line cannot claim to be on changed code or on older code', () => {
  assert.equal(RecapFinding.safeParse(finding({ line: null, onChangedCode: true })).success, false);
  assert.equal(RecapFinding.safeParse(finding({ line: null, onChangedCode: false })).success, false);
  assert.ok(RecapFinding.safeParse(finding({ line: null, onChangedCode: null })).success);
});
