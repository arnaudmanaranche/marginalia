import { test } from 'node:test';
import assert from 'node:assert/strict';
import { lineMetrics } from '../dist/src/line-metrics.js';

const NOW = Date.parse('2026-11-05T12:00:00Z');
const ago = (days, minutes = 0) => new Date(NOW - days * 86_400_000 + minutes * 60_000).toISOString();
const job = (days, outcome, minutes, usd) => ({ startedAt: ago(days), endedAt: outcome === 'running' ? null : ago(days, minutes), outcome, cost: usd === undefined ? null : { usd } });

test('the line counts the jobs of the window, how they ended, the median run and the cost', () => {
  const m = lineMetrics({ now: NOW, pending: 0, decided: [], jobs: [job(1, 'reviewed', 2, 0.2), job(2, 'reviewed', 4, 0.3), job(3, 'failed', 1, 0.05), job(0, 'running'), job(40, 'reviewed', 9, 5)] });
  assert.deepEqual(m.jobs, { total: 4, failed: 1, running: 1, medianMs: 3 * 60_000, costUsd: 0.55 });
});

test('the comments acted on: as proposed, edited, dismissed, over everything decided or still waiting', () => {
  const decided = [
    { at: ago(1), outcome: 'posted' }, { at: ago(2), outcome: 'posted' }, { at: ago(3), outcome: 'posted_edited' },
    { at: ago(4), outcome: 'dismissed' }, { at: ago(60), outcome: 'posted' }, { at: ago(5), outcome: 'posted_unknown' },
  ];
  const m = lineMetrics({ now: NOW, jobs: [], decided, pending: 5 });
  assert.deepEqual(m.findings, { asProposed: 2, edited: 1, unknown: 1, dismissed: 1, pending: 5, fixedBefore: 0, actedOnRate: 0.5 });
  assert.equal(lineMetrics({ now: NOW, jobs: [], decided: [], pending: 0 }).findings.actedOnRate, null);
  assert.equal(lineMetrics({ now: NOW, jobs: [], decided: [], pending: 0 }).jobs.medianMs, null);
});

test('findings fixed by a push count apart and do not move the acted-on rate', () => {
  const m = lineMetrics({ now: NOW, jobs: [], pending: 1, decided: [{ at: ago(1), outcome: 'posted' }, { at: ago(2), outcome: 'fixed_before_mr' }, { at: ago(3), outcome: 'fixed_before_mr' }, { at: ago(90), outcome: 'fixed_before_mr' }] });
  assert.equal(m.findings.fixedBefore, 2);
  assert.equal(m.findings.actedOnRate, 0.5);
});
