import { describe, expect, it } from 'vitest';
import { byMergeRequest, staleAfterDismiss, type Proposal } from './approvalsApi';
import { isUnder, keys } from './queryKeys';

const p = (slug: string, findingId: string) => ({ slug, findingId } as Proposal);

describe('the approvals inbox', () => {
  it('groups the proposals of one MR together, keeping the order they came in', () => {
    const groups = byMergeRequest([p('w/a', '1'), p('w/b', '2'), p('w/a', '3')]);
    expect(groups.map((g) => g.map((x) => x.findingId))).toEqual([['1', '3'], ['2']]);
  });
});

describe('dismissing a proposal', () => {
  it('makes the inbox and the recap of that review stale, and no other review\'s', () => {
    const stale = staleAfterDismiss('w/a');
    expect(stale).toContainEqual(keys.approvals);
    expect(stale.some((k) => isUnder(keys.recap('w/a', 'any|key'), k))).toBe(true);
    expect(stale.some((k) => isUnder(keys.recap('w/b', 'any|key'), k) && k !== keys.approvals)).toBe(false);
  });
});
