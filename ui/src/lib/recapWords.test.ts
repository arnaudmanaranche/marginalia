import { describe, expect, it } from 'vitest';
import type { RecapCounts } from './recapApi';
import { recapRefreshKey } from './recapApi';
import { isUnder, keys, LIVE_KEYS } from './queryKeys';
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

describe('what refreshes the recap', () => {
  const state = { myActivityAt: '2026-11-24T10:00:00Z', authorActivityAt: null, peerActivityAt: null, lastPushAt: '2026-11-24T12:00:00Z', unresolved: 2 };

  it('changes with a new report, my activity, the author, another reviewer, a push or the open threads, and with nothing else', () => {
    const base = recapRefreshKey({ reviewedAt: 'r1', myState: state });
    expect(recapRefreshKey({ reviewedAt: 'r1', myState: { ...state } })).toBe(base);
    for (const changed of [{ reviewedAt: 'r2', myState: state }, { reviewedAt: 'r1', myState: { ...state, myActivityAt: 'x' } }, { reviewedAt: 'r1', myState: { ...state, authorActivityAt: 'x' } }, { reviewedAt: 'r1', myState: { ...state, peerActivityAt: 'x' } },
      { reviewedAt: 'r1', myState: { ...state, lastPushAt: 'x' } }, { reviewedAt: 'r1', myState: { ...state, unresolved: 1 } }]) expect(recapRefreshKey(changed)).not.toBe(base);
  });

  it('is a key even for a review the bot does not track', () => {
    expect(recapRefreshKey({})).toBe('|||||');
  });

  it('is not made stale by every live event: it reads GitLab, so it is outside the live roots', () => {
    const key = keys.recap('back/feat-x', 'r1|');
    expect(LIVE_KEYS.some((root) => isUnder(key, root))).toBe(false);
  });
});
