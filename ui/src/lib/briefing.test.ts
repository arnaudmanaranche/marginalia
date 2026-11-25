import { describe, expect, it } from 'vitest';
import type { Job, MyState, ReviewItem } from './api';
import { agoWords, greetingOf, notesOf, sinceSentence, type BriefingInput } from './briefing';
import { rankNeedingYou } from './feed';

const NOW = new Date(2026, 10, 24, 9, 30).getTime();
const H = 3_600_000;
const iso = (ms: number) => new Date(ms).toISOString();
const state = (over: Partial<MyState> = {}) => ({ requested: false, decision: null, reviewed: false, drafts: 0, myActivityAt: null, lastPushAt: null, authorActivityAt: null, peerActivityAt: null, unresolved: 0, computedAt: 'x', ...over } as MyState);
const review = (slug: string, over: Partial<ReviewItem> = {}) => ({ slug, kind: 'review', tracked: true, critical: 0, important: 0, verdict: 'APPROVE', reviewedAt: iso(NOW - 2 * H), myState: state(), ...over } as ReviewItem);
const job = (slug: string, over: Partial<Job> = {}) => ({ id: slug, slug, kind: 'review', what: 'review', outcome: 'reviewed', startedAt: iso(NOW - 3 * H), endedAt: iso(NOW - 2 * H), failure: null, cost: null, ...over } as Job);
const input = (over: Partial<BriefingInput> = {}): BriefingInput => ({ now: NOW, since: NOW - 5 * H, items: [], jobs: [], budget: null, waiting: 0, contexts: [], projects: [], ...over });

describe('the briefing', () => {
  it('greets by the time of day and the first name', () => {
    expect(greetingOf(NOW, 'Arnaud Manaranche')).toBe('Good morning, Arnaud');
    expect(greetingOf(new Date(2026, 10, 24, 21).getTime(), null)).toBe('Good evening');
    expect(agoWords(5 * H)).toBe('5 hours ago');
    expect(agoWords(30 * H)).toBe('yesterday');
  });
  it('says what changed since the last look, and nothing older', () => {
    const s = sinceSentence(input({
      items: [review('a', { verdict: 'REQUEST_CHANGES' }), review('old', { verdict: 'REQUEST_CHANGES', reviewedAt: iso(NOW - 9 * H) })],
      jobs: [job('a'), job('b'), job('old', { endedAt: iso(NOW - 8 * H) }), job('c', { outcome: 'failed', failure: { kind: 'x', transient: false, title: 't', advice: '' } })],
    }));
    expect(s).toBe('Since you last looked, 5 hours ago, the bot reviewed 2 MRs (1 asks for changes) and 1 run failed.');
    expect(sinceSentence(input())).toBe('Since you last looked, 5 hours ago, nothing changed.');
    expect(sinceSentence(input({ since: null }))).toBe('In the last day, nothing changed.');
  });
  it('notes spend well above a usual day, and says nothing on an ordinary one', () => {
    const days = [1, 2, 3].map((d) => job(`d${d}`, { startedAt: iso(NOW - d * 24 * H), cost: { usd: 5, turns: 1, outputTokens: 1 } }));
    const budget = (spentUsd: number) => ({ spentUsd, limitUsd: 100, over: false });
    expect(notesOf(input({ jobs: days, budget: budget(12) })).map((n) => n.id)).toEqual(['spend']);
    expect(notesOf(input({ jobs: days, budget: budget(6) }))).toEqual([]);
    expect(notesOf(input({ budget: { spentUsd: 30, limitUsd: 30, over: true } }))[0].tone).toBe('fail');
  });
  it('notes a failure that repeats, a backlog and a project nobody taught', () => {
    const fail = (id: string) => job(id, { outcome: 'failed', endedAt: iso(NOW - H), failure: { kind: 'gitlab-502', transient: false, title: 'GitLab answered 502', advice: '' } });
    const notes = notesOf(input({ jobs: [fail('a'), fail('b'), job('c')], waiting: 8, projects: ['api'], contexts: [{ project: 'api', approvedAt: null, draftLearnedAt: null }] }));
    expect(notes.map((n) => n.id)).toEqual(['repeat', 'backlog', 'context:api']);
    expect(notes[0].text).toBe('The same failure hit 2 of the last 3 runs: GitLab answered 502.');
  });
});

describe('what needs you, ranked', () => {
  it('puts critical findings, then high risk, before the usual order of turns', () => {
    const rows = [
      { item: review('plain'), reason: 'First review' },
      { item: review('risky', { risk: 'high' }), reason: 'First review' },
      { item: review('mine', { kind: 'comments', myState: state({ unresolved: 1, peerActivityAt: iso(NOW) }), critical: 1 }), reason: 'Comments on your MR' },
    ];
    expect(rankNeedingYou(rows).map((r) => r.item.slug)).toEqual(['mine', 'risky', 'plain']);
  });
});
