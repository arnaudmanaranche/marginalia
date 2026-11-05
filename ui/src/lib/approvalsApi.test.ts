import { describe, expect, it } from 'vitest';
import { byMergeRequest, type Proposal } from './approvalsApi';

const p = (slug: string, findingId: string) => ({ slug, findingId } as Proposal);

describe('the approvals inbox', () => {
  it('groups the proposals of one MR together, keeping the order they came in', () => {
    const groups = byMergeRequest([p('w/a', '1'), p('w/b', '2'), p('w/a', '3')]);
    expect(groups.map((g) => g.map((x) => x.findingId))).toEqual([['1', '3'], ['2']]);
  });
});
