import { test } from 'node:test';
import assert from 'node:assert/strict';
import { BUILT_IN_METHODS, METHOD_NAMES, fillMethod } from '../dist/src/pipeline/stage-methods.js';
import { chapterPrompt } from '../dist/src/pipeline/review-prompts.js';

test('a method fills its variables and leaves out a line whose variable has no value', () => {
  const t = 'first\nthe checklist in {{checklist}}: read it\nlast {{ target }}';
  assert.equal(fillMethod(t, { checklist: 'a.md', target: 'main' }), 'first\nthe checklist in a.md: read it\nlast main');
  assert.equal(fillMethod(t, { checklist: '', target: 'main' }), 'first\nlast main');
  assert.equal(fillMethod(t), 'first');
});

test('every built-in method has text, and none states the answer shape', () => {
  for (const name of METHOD_NAMES) {
    assert.ok(BUILT_IN_METHODS[name].trim(), name);
    assert.doesNotMatch(BUILT_IN_METHODS[name], /Answer with only this JSON/, name);
  }
});

test('a chapter prompt keeps the answer shape whatever method it is given', () => {
  const map = { overview: { before: 'B', after: 'A' }, risk: { level: 'low', rationale: 'R', axes: [] }, chapters: [{ title: 'C', summary: 'S', files: ['a.ts'], check: 'K' }] };
  const p = chapterPrompt({ context: 'CTX', map, chapter: map.chapters[0], index: 0, checklist: null, method: 'Only cite the repo rules.' });
  assert.match(p, /Only cite the repo rules\./);
  assert.match(p, /Answer with only this JSON/);
  assert.doesNotMatch(p, /How to review/);
});
