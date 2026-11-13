import { test } from 'node:test';
import assert from 'node:assert/strict';
import { createLimiter } from '../dist/src/pipeline/limiter.js';
import { mergeReview } from '../dist/src/pipeline/review-merge.js';

test('the limiter runs at most n at once and hands a place to the next in line', async () => {
  const limit = createLimiter(2);
  let active = 0; let peak = 0; const order = [];
  const task = (n) => limit(async () => { active += 1; peak = Math.max(peak, active); order.push(n); await new Promise((r) => setTimeout(r, 10)); active -= 1; return n; });
  assert.deepEqual(await Promise.all([1, 2, 3, 4, 5].map(task)), [1, 2, 3, 4, 5]);
  assert.equal(peak, 2);
  assert.deepEqual(order, [1, 2, 3, 4, 5]);
});

test('a duplicate across chapters keeps the reproduction, whichever copy was run', () => {
  const f = (extra = {}) => ({ severity: 'important', title: 'Total is negative', path: 'a.ts', line: 3, body: 'b', proof: 'runtime', ...extra });
  const verification = { status: 'reproduced', evidence: 'x' };
  const map = { chapters: [{ title: 'A', summary: 's', files: ['a.ts'] }, { title: 'B', summary: 's', files: ['a.ts'] }], overview: { after: 'ok' }, risk: {}, warnings: [] };
  const merged = mergeReview({ map, chapters: [{ result: { findings: [f()], verified: '' } }, { result: { findings: [f({ verification })], verified: '' } }] });
  assert.equal(merged.data.findings.length, 1);
  assert.deepEqual(merged.data.findings[0].verification, verification);
  assert.deepEqual(merged.data.tour.map((c) => c.findings.length), [1, 0]);
});
