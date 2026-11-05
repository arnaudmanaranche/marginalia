import { describe, expect, it } from 'vitest';
import type { Proposal } from './approvalsApi';
import { keyOf, ordered, selection, step } from './inbox';

const p = (slug: string, findingId: string) => ({ slug, findingId } as Proposal);
const list = [p('w/a', '1'), p('w/b', '2'), p('w/a', '3')];

describe('the inbox', () => {
  it('reads by MR, then as the proposals came', () => {
    expect(ordered(list).map(keyOf)).toEqual(['w/a:1', 'w/a:3', 'w/b:2']);
  });
  it('keeps the selection, and moves to the next one when it was decided', () => {
    const before = ordered(list);
    expect(keyOf(selection(before, 'w/a:3')!)).toBe('w/a:3');
    const after = before.filter((x) => keyOf(x) !== 'w/a:3');
    expect(keyOf(selection(after, 'w/a:3', before)!)).toBe('w/b:2');
    const last = before.filter((x) => keyOf(x) !== 'w/b:2');
    expect(keyOf(selection(last, 'w/b:2', before)!)).toBe('w/a:3');
    expect(selection([], 'w/a:1', before)).toBe(null);
  });
  it('steps up and down without leaving the list', () => {
    const o = ordered(list);
    expect(step(o, 'w/a:1', 1)).toBe('w/a:3');
    expect(step(o, 'w/b:2', 1)).toBe('w/b:2');
    expect(step(o, 'w/a:1', -1)).toBe('w/a:1');
  });
});
