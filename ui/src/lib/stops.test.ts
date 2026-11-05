import { describe, expect, it } from 'vitest';
import type { TourStop } from './api';
import { stopsToRead } from './stops';

const stop = (id: string, over: Partial<TourStop> = {}): TourStop => ({ id, title: id, summary: null, files: [], findingIds: [], ...over });

describe('stopsToRead', () => {
  it('keeps a stop with a finding, a thread, or that could not be reviewed, and drops the rest', () => {
    const tour = [stop('quiet'), stop('finding', { findingIds: ['f1'] }), stop('thread', { threadIds: ['abc'] }), stop('failed', { unreviewed: true }), stop('tests', { supporting: true })];
    expect(stopsToRead(tour).map((s) => s.id)).toEqual(['finding', 'thread', 'failed']);
  });
  it('counts a finding only when the review holds it', () => {
    const tour = [stop('real', { findingIds: ['f1'] }), stop('ghost', { findingIds: ['gone'] }), stop('ghost-thread', { findingIds: ['gone'], threadIds: ['t'] })];
    expect(stopsToRead(tour, [{ id: 'f1' } as never]).map((s) => s.id)).toEqual(['real', 'ghost-thread']);
  });
});
