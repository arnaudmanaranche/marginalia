import { describe, expect, it } from 'vitest';
import type { BotStatus, ReviewItem } from './api';
import { cuesBetween, snapshot } from './soundCues';

const item = (slug: string, over: Partial<ReviewItem> = {}) => ({ slug, project: 'webapp', kind: 'review', iid: 1, reviewedAt: '2026-10-29T08:00:00Z', failure: null, ...over }) as ReviewItem;
const status = (mrs: { iid: number; status: string }[]) => ({ mrs: mrs.map((m) => ({ project: 'webapp', ...m })) }) as BotStatus;

describe('cuesBetween', () => {
  it('stays silent on what was there when the page opened', () => {
    expect(cuesBetween(null, snapshot([item('a')], null))).toEqual([]);
  });

  it('sounds an arrival, a report ready and a failure, once each', () => {
    const before = snapshot([item('a'), item('b', { iid: 2 })], null);
    const after = snapshot([
      item('a', { reviewedAt: '2026-10-29T09:00:00Z' }),
      item('b', { iid: 2, failure: { kind: 'no_report', transient: false, title: 'T', advice: 'A' } }),
      item('c', { iid: 3 }),
      item('d', { iid: 4 }),
    ], null);
    expect(cuesBetween(before, after).sort()).toEqual(['arrive', 'done', 'failed']);
  });

  it('says nothing of a failure retried on its own', () => {
    const before = snapshot([item('a')], null);
    expect(cuesBetween(before, snapshot([item('a', { failure: { kind: 'network', transient: true, title: 'T', advice: 'A' } })], null))).toEqual([]);
  });

  it('sounds a first report for an MR that was waiting for it', () => {
    const before = snapshot([item('a', { awaiting: 'queued' })], null);
    expect(cuesBetween(before, snapshot([item('a')], null))).toEqual(['done']);
  });

  it('knocks when a reviewer writes on my MR, not on one I review', () => {
    const items = [item('mine', { kind: 'comments', iid: 7 }), item('theirs', { iid: 8 })];
    const before = snapshot(items, status([{ iid: 7, status: 'up_to_date' }, { iid: 8, status: 'up_to_date' }]));
    expect(cuesBetween(before, snapshot(items, status([{ iid: 7, status: 'pending' }, { iid: 8, status: 'up_to_date' }])))).toEqual(['comment']);
    expect(cuesBetween(before, snapshot(items, status([{ iid: 7, status: 'up_to_date' }, { iid: 8, status: 'pending' }])))).toEqual([]);
  });
});
