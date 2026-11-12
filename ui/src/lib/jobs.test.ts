import { describe, expect, it } from 'vitest';
import type { Job } from './api';
import { collapseSkipped, durationOf, routeOf, stateOf, targetOf, withTitles } from './jobs';

const job = (over: Partial<Job> = {}): Job => ({
  id: 'x', slug: 'webapp/own-feat-a', project: 'webapp', iid: null, kind: 'review', command: '/code-review',
  startedAt: '2026-11-05T10:00:00.000Z', endedAt: '2026-11-05T10:01:05.000Z', outcome: 'reviewed', error: null, failure: null,
  stages: [], stepCount: 0, cost: null, what: 'own', title: null, ...over,
});

describe('a job in the list', () => {
  it('says how it stands: the running stage, the failure, or done', () => {
    expect(stateOf(job({ outcome: 'running', stages: [{ id: 'agent', label: 'Claude reviews the MR', state: 'running', startedAt: null, endedAt: null }] }))).toEqual({ tone: 'running', label: 'Claude reviews the MR' });
    expect(stateOf(job({ outcome: 'failed', failure: { kind: 'gitlab', transient: true, title: 'GitLab did not answer', advice: '' } })).label).toBe('GitLab did not answer');
    expect(stateOf(job()).tone).toBe('done');
  });
  it('names what it ran on, and how long it took', () => {
    expect(targetOf(job())).toBe('feat-a');
    expect(targetOf(job({ title: 'Add coupons' }))).toBe('Add coupons');
    expect(targetOf(job({ what: 'understand' }))).toBe('The whole project');
    expect(durationOf(job())).toBe('1m 05s');
    expect(durationOf(job({ endedAt: null }), Date.parse('2026-11-05T10:00:09.000Z'))).toBe('9s');
  });
  it('leads to the review it was about, or to the context it learned', () => {
    expect(routeOf(job())).toBe('webapp/own-feat-a');
    expect(routeOf(job({ what: 'understand' }))).toBe('context:webapp');
  });
  it("takes its MR's title when it came without one", () => {
    const titles = new Map([['webapp/own-feat-a', 'Add coupons']]);
    expect(withTitles([job()], titles)[0].title).toBe('Add coupons');
    expect(withTitles([job({ title: 'Own' })], titles)[0].title).toBe('Own');
    expect(withTitles([job({ slug: 'webapp/other' })], titles)[0].title).toBeNull();
  });
  it('folds skipped runs of the same job back to back into one line, and nothing else', () => {
    const skip = job({ outcome: 'skipped' });
    const rows = collapseSkipped([skip, skip, skip, job(), skip, job({ outcome: 'skipped', what: 'comments' })]);
    expect(rows.map((r) => [r.job.outcome, r.job.what, r.repeats])).toEqual([['skipped', 'own', 3], ['reviewed', 'own', 1], ['skipped', 'own', 1], ['skipped', 'comments', 1]]);
  });
});
