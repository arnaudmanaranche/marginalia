import { describe, expect, it } from 'vitest';
import type { Job } from './api';
import { collapseRepeats, durationOf, routeOf, stateOf, targetOf, withTitles } from './jobs';

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
  it('folds skipped runs of the same job back to back into one line, and keeps runs that did something apart', () => {
    const skip = job({ outcome: 'skipped' });
    const rows = collapseRepeats([skip, skip, skip, job(), skip, job({ outcome: 'skipped', what: 'comments' })]);
    expect(rows.map((r) => [r.job.outcome, r.job.what, r.repeats])).toEqual([['skipped', 'own', 3], ['reviewed', 'own', 1], ['skipped', 'own', 1], ['skipped', 'comments', 1]]);
  });
  it('folds failures with the same cause back to back into one line, across MRs, and counts the MRs', () => {
    const down = (slug: string) => job({ slug, outcome: 'failed', failure: { kind: 'auth', transient: false, title: 'Claude is not logged in', advice: '' } });
    const gitlab = job({ outcome: 'failed', failure: { kind: 'gitlab', transient: true, title: 'GitLab could not be reached', advice: '' } });
    const rows = collapseRepeats([down('w/a'), down('w/b'), down('w/a'), gitlab, down('w/c')]);
    expect(rows.map((r) => [r.job.failure?.title, r.repeats, r.targets])).toEqual([['Claude is not logged in', 3, 2], ['GitLab could not be reached', 1, 1], ['Claude is not logged in', 1, 1]]);
  });
  it('keeps unknown failures apart unless their errors are the same', () => {
    const unknown = (error: string | null, id = 'x') => job({ id, outcome: 'failed', error, failure: { kind: 'unknown', transient: false, title: 'Something went wrong', advice: '' } });
    expect(collapseRepeats([unknown('ENOSPC'), unknown('EACCES'), unknown('EACCES'), unknown(null, 'a'), unknown(null, 'b')]).map((r) => r.repeats)).toEqual([1, 2, 1, 1]);
  });
});
