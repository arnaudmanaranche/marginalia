import { describe, expect, it } from 'vitest';
import { isLiveFor, liveRunOf } from './liveRun';

const current = (over = {}) => ({ project: 'webapp', iid: 4047, title: 't', startedAt: 'x', ...over });
const own = { slug: 'webapp/own-chore-x', iid: 4047, project: 'webapp' };
const triage = { slug: 'webapp/mr-comments-chore-x', iid: 4047, project: 'webapp' };

describe('the run in progress', () => {
  it('is the review it names, not every review of the same MR', () => {
    expect(isLiveFor(current({ slug: own.slug }), own)).toBe(true);
    expect(isLiveFor(current({ slug: own.slug }), triage)).toBe(false);
  });
  it('falls back to the MR number before its first update, and is nothing without a run', () => {
    expect(isLiveFor(current(), triage)).toBe(true);
    expect(isLiveFor(current(), { slug: 'webapp/own-b', iid: null, project: 'webapp' })).toBe(false);
    expect(isLiveFor(null, own)).toBe(false);
  });
});

describe('the runs of every project', () => {
  const status = (over = {}) => ({ pid: 1, phase: 'reviewing' as const, lastPoll: null, nextPollAt: null, current: null, ...over });
  it('finds the run on this review among those of the projects running side by side', () => {
    const other = current({ project: 'api', iid: 12, slug: 'api/feat-y' });
    const mine = current({ slug: own.slug });
    expect(liveRunOf(status({ running: [mine, other], current: other }), own)).toBe(mine);
    expect(liveRunOf(status({ running: [other], current: other }), own)).toBeNull();
  });
  it('reads `current` alone from a status written before', () => {
    expect(liveRunOf(status({ current: current({ slug: own.slug }) }), own)?.slug).toBe(own.slug);
    expect(liveRunOf(null, own)).toBeNull();
  });
});
