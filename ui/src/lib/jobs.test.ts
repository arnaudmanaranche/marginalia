import { describe, expect, it } from 'vitest';
import type { Job } from './api';
import { durationOf, routeOf, stateOf, targetOf } from './jobs';

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
});
