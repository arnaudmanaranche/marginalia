import { describe, expect, it } from 'vitest';
import type { TourStop } from './api';
import { stopsToRead } from './stops';

const stop = (id: string, over: Partial<TourStop> = {}): TourStop => ({ id, title: id, summary: null, files: [], findingIds: [], ...over });

describe('stopsToRead', () => {
  it('keeps a stop with a finding, a thread, or that could not be reviewed, and drops the rest', () => {
    const tour = [stop('quiet'), stop('finding', { findingIds: ['f1'] }), stop('thread', { threadIds: ['abc'] }), stop('failed', { unreviewed: true }), stop('tests', { supporting: true })];
    expect(stopsToRead(tour).map((s) => s.id)).toEqual(['finding', 'thread', 'failed']);
  });
});
