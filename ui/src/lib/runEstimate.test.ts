import { describe, expect, it } from 'vitest';
import type { Job } from './api';
import { runEstimate } from './runEstimate';

const job = (slug: string, usd: number | null, over: Partial<Job> = {}): Job => ({
  id: String(Math.random()), slug, project: 'w', iid: null, kind: 'review', command: '', startedAt: '2026-11-05T10:00:00Z', endedAt: '2026-11-05T10:01:00Z',
  outcome: 'reviewed', error: null, failure: null, stages: [], stepCount: 0, cost: usd === null ? null : { usd, turns: 1, outputTokens: 1 }, what: 'review', title: null, ...over,
});

describe('runEstimate', () => {
  it("is the median of this MR's paid runs", () => {
    expect(runEstimate([job('w/a', 1), job('w/a', 3), job('w/a', 2), job('w/b', 9)], 'w/a', 'review')).toBe(2);
  });
  it('falls back to runs of the same kind, and ignores runs that cost nothing', () => {
    expect(runEstimate([job('w/b', 1.5), job('w/c', 0.5, { what: 'comments' }), job('w/a', null)], 'w/a', 'review')).toBe(1.5);
    expect(runEstimate([job('w/a', 0), job('w/a', 2)], 'w/a', 'review')).toBe(2);
  });
  it('leaves out a run still going: its cost so far is not what a run costs', () => {
    expect(runEstimate([job('w/a', 0.1, { outcome: 'running', endedAt: null }), job('w/a', 2)], 'w/a', 'review')).toBe(2);
  });
  it('is null when nothing tells', () => {
    expect(runEstimate([], 'w/a', 'review')).toBeNull();
  });
});
