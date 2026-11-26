import { describe, expect, it } from 'vitest';
import type { RecapCounts } from './recapApi';
import { recapLine, recapParts, STANDING_WORDS } from './recapWords';

const counts = (over: Partial<RecapCounts> = {}): RecapCounts => ({ addressed: 0, contested: 0, untouched: 0, dropped: 0, newFindings: 0, reworded: 0, gone: 0, ...over });

describe('the recap words', () => {
  it('says how my comments fared, then what is new, and nothing at zero', () => {
    expect(recapLine(counts({ addressed: 3, contested: 1, untouched: 2, newFindings: 2 }))).toBe('3 addressed · 1 contested · 2 untouched · 2 new');
    expect(recapLine(counts({ untouched: 1 }))).toBe('1 untouched');
  });

  it('does not count what I dropped or what the bot stopped raising: neither is news', () => {
    expect(recapLine(counts({ dropped: 4, gone: 3 }))).toBe('');
  });

  it('asks about a reworded finding instead of calling it new', () => {
    expect(recapLine(counts({ reworded: 1 }))).toBe('1 reworded?');
  });

  it('gives each part a tone, so the panel and the row colour the same way', () => {
    const tones = Object.fromEntries(recapParts(counts({ addressed: 1, contested: 1, untouched: 1, newFindings: 1 })).map((p) => [p.key, p.tone]));
    expect(tones).toEqual({ addressed: 'success', contested: 'warning', untouched: 'neutral', new: 'info' });
    expect(STANDING_WORDS.dropped.label).toBe('dropped');
  });
});
