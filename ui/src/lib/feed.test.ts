import { describe, expect, it } from 'vitest';
import type { Job, MyState, ReviewItem } from './api';
import { failuresNeedingYou, reviewsNeedingYou, runningNow } from './feed';

const state = (over: Partial<MyState> = {}): MyState => ({ requested: false, decision: null, reviewed: false, drafts: 0, myActivityAt: null, lastPushAt: null, authorActivityAt: null, peerActivityAt: null, unresolved: 0, computedAt: 'x', ...over } as MyState);
const review = (slug: string, myState: MyState | null, over: Partial<ReviewItem> = {}) => ({ slug, kind: 'review', tracked: true, myState, ...over } as ReviewItem);
const job = (slug: string, outcome: Job['outcome'], transient = false, id = slug) => ({ id, slug, outcome, failure: outcome === 'failed' ? { kind: 'x', transient, title: 't', advice: '' } : null } as Job);

describe('the feed', () => {
  it('lists the turns that wait on me, most pressing first, and nothing that waits on others', () => {
    const items = [
      review('waiting', state({ reviewed: true, myActivityAt: '2026-11-05T10:00:00Z' })),
      review('mine', state({ unresolved: 2, peerActivityAt: '2026-11-05T10:00:00Z' }), { kind: 'comments' }),
      review('first', state()),
      review('own', null, { kind: 'own' }),
      review('sent', state({ drafts: 2 })),
    ];
    expect(reviewsNeedingYou(items).map((x) => [x.item.slug, x.reason])).toEqual([['first', 'First review'], ['sent', 'Review to send'], ['mine', 'Comments on your MR']]);
  });
  it('flags a review whose latest run failed for good, not one that retries or later passed', () => {
    const jobs = [job('a', 'reviewed', false, '2'), job('a', 'failed', false, '1'), job('b', 'failed', true), job('c', 'failed'), job('d', 'running')];
    expect(failuresNeedingYou(jobs).map((j) => j.slug)).toEqual(['c']);
    expect(runningNow(jobs).map((j) => j.slug)).toEqual(['d']);
  });
});
