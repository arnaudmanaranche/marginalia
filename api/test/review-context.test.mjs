import { test } from 'node:test';
import assert from 'node:assert/strict';
import { projectContextPrompt } from '../dist/src/context-prompt.js';
import { enforceContract } from '../dist/src/guardrail.js';
import { normalizeFindingsData } from '../dist/src/findings-json.js';
import { buildShape } from '../dist/src/findings.js';
import { parseMap } from '../dist/src/pipeline/review-prompts.js';
import { mergeReview } from '../dist/src/pipeline/review-merge.js';

const stored = (state = 'approved') => ({
  project: 'api', commit: 'abcdef123456', learnedAt: 'x', state, approvedBy: 'alex', approvedAt: 'y',
  context: {
    summary: 'An API that books rooms.',
    glossary: [{ name: 'Booking', summary: 'A held room.', codeNames: ['Reservation'], avoid: ['Order'], sources: [{ kind: 'file', ref: 'a' }] }],
    stack: [{ name: 'DB', summary: 'Postgres.', sources: [{ kind: 'file', ref: 'a' }] }],
    features: [{ name: 'Search', summary: 'Rooms.', sources: [{ kind: 'file', ref: 'a' }] }],
    criticalPaths: [
      { name: 'Search', summary: 'Rooms for dates.', rank: 2, sources: [{ kind: 'file', ref: 'a' }] },
      { name: 'Payment', summary: 'Card capture.', rank: 1, where: ['src/pay'], fragile: ['3DS redirect'], sources: [{ kind: 'ticket', ref: 'BK-1' }] },
    ],
  },
});

test('an approved context is told to the review, critical paths by rank, with the words to use', () => {
  const text = projectContextPrompt(stored());
  assert.match(text, /approved by alex \(learned at abcdef12\)/);
  assert.ok(text.indexOf('1. Payment') < text.indexOf('2. Search'));
  assert.match(text, /lives in: src\/pay\n   fragile: 3DS redirect/);
  assert.match(text, /Booking \(code: Reservation\): A held room\. Not: Order\./);
  assert.match(text, /"criticalPaths"/);
});

test('no approved context, nothing is told: a draft is not used', () => {
  assert.equal(projectContextPrompt(null), '');
  assert.equal(projectContextPrompt(stored('draft')), '');
});

const review = (patch = {}) => JSON.stringify({
  verdict: 'APPROVE', summary: 'Fine.', overview: { before: 'a', after: 'b' },
  tour: [{ title: 't', summary: 's', files: ['x.ts'] }], findings: [], ...patch,
});

test('a review names the critical paths it touches, and keeps them once read back', () => {
  enforceContract('review', review({ criticalPaths: ['Payment'] }));
  enforceContract('review', review());
  assert.throws(() => enforceContract('review', review({ criticalPaths: [''] })), /criticalPaths/);
  assert.deepEqual(normalizeFindingsData(JSON.parse(review({ criticalPaths: ['Payment', 3] }))).criticalPaths, ['Payment']);
  assert.deepEqual(normalizeFindingsData(JSON.parse(review())).criticalPaths, []);
  assert.deepEqual(buildShape({ markdown: '', findingsRaw: review({ criticalPaths: ['Payment'] }) }).criticalPaths, ['Payment']);
  assert.deepEqual(buildShape({ markdown: '' }).criticalPaths, []);
});

test('the staged map carries the critical paths into the merged review', () => {
  const answer = '```json\n' + JSON.stringify({ overview: { before: 'a', after: 'b' }, criticalPaths: ['Payment'], risk: { level: 'high', rationale: 'Payments.' }, chapters: [{ title: 'Pay', summary: 's', files: ['src/pay/a.ts'], check: 'c' }] }) + '\n```';
  const map = parseMap(answer, ['src/pay/a.ts']);
  assert.deepEqual(map.value.criticalPaths, ['Payment']);
  const { data } = mergeReview({ map: map.value, chapters: [{ result: { findings: [], verified: '' } }] });
  assert.deepEqual(data.criticalPaths, ['Payment']);
  enforceContract('review', JSON.stringify(data));
});
