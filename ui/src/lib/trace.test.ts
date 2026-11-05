import { describe, expect, it } from 'vitest';
import type { Job, RunStage } from './api';
import { byDay, matches, spansOf } from './trace';

const stage = (id: string, state: RunStage['state'], start: string | null, end: string | null): RunStage => ({ id, label: id, state, startedAt: start, endedAt: end });
const job = (over: Partial<Job>): Job => ({ id: 'x', slug: 'w/a', project: 'w', iid: 1, kind: 'review', command: 'c', startedAt: '2026-11-05T10:00:00Z', endedAt: null, outcome: 'reviewed', error: null, failure: null, stages: [], stepCount: 0, cost: null, what: 'review', title: null, ...over });

describe('a job as a trace', () => {
  it('places each started stage on the run\'s time axis; one still going ends now', () => {
    const { spans, total } = spansOf([
      stage('a', 'done', '2026-11-05T10:00:00Z', '2026-11-05T10:00:02Z'),
      stage('b', 'running', '2026-11-05T10:00:02Z', null),
      stage('c', 'pending', null, null),
    ], '2026-11-05T10:00:00Z', Date.parse('2026-11-05T10:00:10Z'));
    expect(spans.map((s) => [s.id, s.start, s.end])).toEqual([['a', 0, 2000], ['b', 2000, 10000]]);
    expect(total).toBe(10000);
  });
  it('filters by state and by line, reviews and triages together', () => {
    expect(matches(job({ outcome: 'running' }), 'running')).toBe(true);
    expect(matches(job({ what: 'comments' }), 'review')).toBe(true);
    expect(matches(job({ what: 'own' }), 'review')).toBe(false);
    expect(matches(job({ what: 'understand' }), 'understand')).toBe(true);
  });
  it('groups jobs under the day they started, keeping their order', () => {
    const now = Date.parse('2026-11-05T15:00:00Z');
    const groups = byDay([job({ id: '1', startedAt: '2026-11-05T14:00:00Z' }), job({ id: '2', startedAt: '2026-11-05T09:00:00Z' }), job({ id: '3', startedAt: '2026-11-04T09:00:00Z' })], now);
    expect(groups.map((g) => [g.day, g.jobs.map((j) => j.id)])).toEqual([['Today', ['1', '2']], ['Yesterday', ['3']]]);
  });
});
