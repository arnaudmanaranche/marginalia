import { test } from 'node:test';
import assert from 'node:assert/strict';
import { lastSubmittedAt, pickBaseline } from '../dist/src/recap-baseline.js';

const reports = [{ id: null, at: 300 }, { id: 'r2', at: 200 }, { id: 'r1', at: 100 }];

test('the last submit is the latest published comment; drafts do not count', () => {
  const entries = [
    { state: 'published', at: '2026-11-20T10:00:00Z' },
    { state: 'published', at: '2026-11-22T10:00:00Z' },
    { state: 'draft', at: '2026-11-25T10:00:00Z' },
  ];
  assert.equal(lastSubmittedAt(entries), Date.parse('2026-11-22T10:00:00Z'));
  assert.equal(lastSubmittedAt([{ state: 'draft', at: '2026-11-25T10:00:00Z' }]), null);
  assert.equal(lastSubmittedAt([]), null);
});

test('after a submit, the baseline is the newest report written at or before it', () => {
  const b = pickBaseline({ submittedAt: 250, reports });
  assert.equal(b.kind, 'submitted');
  assert.equal(b.at, 250);
  assert.equal(b.report.id, 'r2');
  assert.equal(pickBaseline({ submittedAt: 200, reports }).report.id, 'r2');
});

test('a submit made from the current report leaves nothing to compare findings with', () => {
  assert.equal(pickBaseline({ submittedAt: 350, reports }).report.id, null);
});

test('a submit older than every report has no report to compare with, but is still the baseline', () => {
  const b = pickBaseline({ submittedAt: 50, reports });
  assert.equal(b.kind, 'submitted');
  assert.equal(b.report, null);
});

test('with nothing submitted, the baseline is the report before the current one', () => {
  const b = pickBaseline({ submittedAt: null, reports });
  assert.equal(b.kind, 'previous');
  assert.equal(b.report.id, 'r2');
  assert.equal(b.at, 200);
});

test('with nothing submitted and a single report there is no baseline at all', () => {
  const b = pickBaseline({ submittedAt: null, reports: [reports[0]] });
  assert.equal(b.report, null);
  assert.equal(b.at, null);
});
