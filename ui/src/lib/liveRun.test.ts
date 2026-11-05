import { describe, expect, it } from 'vitest';
import { isLiveFor } from './liveRun';

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
