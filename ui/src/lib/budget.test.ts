import { describe, expect, it } from 'vitest';
import { kindLabel, money, shareOf, toneOf, type Budget } from './budget';

const b = (over: Partial<Budget>): Budget => ({
  since: '', resetsAt: '', limitUsd: 25, spentUsd: 0, leftUsd: 25, over: false, runs: 0, byKind: [], byMr: [], ...over,
});

describe('budget', () => {
  it('is calm, then amber near the limit, then red once reached', () => {
    expect(toneOf(b({ spentUsd: 10 }))).toBe('ok');
    expect(toneOf(b({ spentUsd: 20 }))).toBe('warn');
    expect(toneOf(b({ spentUsd: 26, over: true }))).toBe('fail');
  });
  it('has no share and stays calm without a limit', () => {
    expect(shareOf(b({ limitUsd: null, spentUsd: 300 }))).toBeNull();
    expect(toneOf(b({ limitUsd: null, spentUsd: 300 }))).toBe('ok');
  });
  it('never fills past the end', () => {
    expect(shareOf(b({ spentUsd: 40, over: true }))).toBe(1);
  });
  it('says amounts and kinds in words', () => {
    expect(money(3.5)).toBe('$3.50');
    expect(kindLabel('review')).toBe('Reviews');
    expect(kindLabel('other')).toBe('other');
  });
});
