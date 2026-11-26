import { describe, expect, it } from 'vitest';
import type { RecapComment, RecapFinding, Recap } from './recapApi';
import { byAttention, freshGroups, isQuiet, mrSentence, recapHeading, signalWords, whereOf } from './recapText';

const comment = (over: Partial<RecapComment> = {}): RecapComment => ({ findingId: 'a', title: 't', path: 'src/a.ts', line: 3, standing: 'untouched', signals: { linesChanged: null, replied: false, resolved: false }, disagreement: false, url: null, ...over });
const finding = (id: string, onChangedCode: boolean | null): RecapFinding => ({ id, title: id, severity: 'important', path: 'src/a.ts', line: 3, onChangedCode });

describe('the recap sentences', () => {
  it('heads the recap by what it is since: my submit, or the previous report', () => {
    const at = new Date(Date.now() - 3 * 3_600_000).toISOString();
    expect(recapHeading({ kind: 'submitted', at })).toBe('Since you submitted (3h ago)');
    expect(recapHeading({ kind: 'previous', at })).toBe('Since the previous report (3h ago)');
  });

  it('says what happened to the MR: commits, files, and the files with my comments', () => {
    expect(mrSentence({ commits: 4, files: 7, commentedFilesTouched: 2 })).toBe('4 commits, 7 files changed, 2 with your comments');
    expect(mrSentence({ commits: 1, files: 1, commentedFilesTouched: 0 })).toBe('1 commit, 1 file changed');
    expect(mrSentence({ commits: 0, files: 0, commentedFilesTouched: 0 })).toBe('Nothing was pushed since.');
  });

  it('says it cannot tell what changed, instead of guessing, when the version is gone', () => {
    expect(mrSentence(null)).toMatch(/cannot be told.*no longer on GitLab/);
  });

  it('is quiet when there is nothing of mine, nothing new and nothing reworded', () => {
    const base = { comments: [], newFindings: [], reworded: [] } as unknown as Recap;
    expect(isQuiet(base)).toBe(true);
    expect(isQuiet({ ...base, newFindings: [finding('n', true)] })).toBe(false);
  });
});

describe('a comment', () => {
  it('says what its standing rests on, and nothing about code that cannot be compared', () => {
    expect(signalWords(comment({ signals: { linesChanged: true, replied: true, resolved: true } }))).toEqual(['code changed', 'thread resolved', 'replied']);
    expect(signalWords(comment({ signals: { linesChanged: false, replied: false, resolved: false } }))).toEqual(['code untouched']);
    expect(signalWords(comment())).toEqual([]);
  });

  it('does not say twice what a disagreement flag already says', () => {
    const flagged = comment({ disagreement: true, signals: { linesChanged: false, replied: true, resolved: true } });
    expect(signalWords(flagged)).toEqual(['replied']);
  });

  it('puts what needs me first: contested, untouched, addressed, dropped', () => {
    const order = byAttention(['dropped', 'addressed', 'untouched', 'contested'].map((s) => comment({ findingId: s, standing: s as RecapComment['standing'] })));
    expect(order.map((c) => c.findingId)).toEqual(['contested', 'untouched', 'addressed', 'dropped']);
  });

  it('names its place as a file and a line, or the file alone, or nothing', () => {
    expect(whereOf({ path: 'src/a.ts', line: 3 })).toBe('src/a.ts:3');
    expect(whereOf({ path: 'src/a.ts', line: null })).toBe('src/a.ts');
    expect(whereOf({ path: null, line: null })).toBeNull();
  });
});

describe('new findings', () => {
  it('lists those on changed code first, and claims "older" only when it is known', () => {
    const groups = freshGroups([finding('old', false), finding('changed', true), finding('unknown', null)]);
    expect(groups.changed.map((f) => f.id)).toEqual(['changed', 'unknown']);
    expect(groups.older.map((f) => f.id)).toEqual(['old']);
  });
});
