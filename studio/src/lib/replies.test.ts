import { describe, expect, it } from 'vitest';
import type { FixesStatus, Thread } from './api';
import { replyBody, reviewerThreads } from './replies';

const note = (over: Partial<Thread['notes'][number]> = {}) => ({ id: 1, author: 'rev', authorName: 'Rev', mine: false, bot: false, body: 'x', at: '2026-01-01', ...over });
const thread = (over: Partial<Thread> = {}): Thread => ({ id: 'abc12345', resolved: false, resolvable: true, path: null, line: null, side: null, outdated: false, notes: [note()], ...over });
const fixes = (over: Partial<FixesStatus> = {}): FixesStatus => ({ ref: 'marginalia/x', branch: 'x', state: 'pushed', fixesSha: '72d00457334632d7', remoteSha: '72d00457334632d7', commits: [], ...over });

describe('reviewerThreads', () => {
  it('keeps the open threads a reviewer started, general comments included', () => {
    const kept = thread({ id: 'keep' });
    const threads = [kept, thread({ resolved: true }), thread({ notes: [note({ mine: true })] }), thread({ notes: [note({ bot: true })] }), thread({ notes: [] })];
    expect(reviewerThreads(threads)).toEqual([kept]);
  });
});

describe('replyBody', () => {
  it('sends a disagreement or an answer as written', () => {
    expect(replyBody('  Out of scope.  ', false, null)).toBe('Out of scope.');
  });

  it('holds a fixed reply until the fix is pushed, then names the commit', () => {
    expect(replyBody('Extracted useLatest.', true, fixes({ state: 'ready' }))).toBeNull();
    expect(replyBody('Extracted useLatest.', true, null)).toBeNull();
    expect(replyBody('Extracted useLatest.', true, fixes())).toBe('Extracted useLatest.\n\nFixed in 72d00457.');
  });
});
