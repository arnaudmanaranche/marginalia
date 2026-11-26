import type { Recap, RecapComment, RecapFinding } from '../lib/recapApi';

// A re-reviewed MR as a recap tells it, for the stories and the tests of its components.
export const recapComment = (over: Partial<RecapComment> = {}): RecapComment => ({
  findingId: 'a', title: 'The total goes negative with a coupon', path: 'src/cart.ts', line: 42, standing: 'untouched',
  signals: { linesChanged: false, replied: false, resolved: false }, disagreement: false, url: 'https://gitlab.example/mr/7#note_1', ...over,
});

export const recapFinding = (over: Partial<RecapFinding> = {}): RecapFinding => ({ id: 'n', title: 'A race in the queue', severity: 'important', path: 'src/queue.ts', line: 9, onChangedCode: true, ...over });

export const recapFixture = (over: Partial<Recap> = {}): Recap => {
  const comments = [
    recapComment({ findingId: 'a', standing: 'addressed', signals: { linesChanged: true, replied: true, resolved: true } }),
    recapComment({ findingId: 'b', title: 'Handle the empty list', path: 'src/list.ts', line: 7, standing: 'contested', disagreement: true, signals: { linesChanged: false, replied: true, resolved: true } }),
    recapComment({ findingId: 'c', title: 'Name this better', path: 'src/util.ts', line: 3, standing: 'untouched' }),
  ];
  const newFindings = [recapFinding(), recapFinding({ id: 'o', title: 'A comment is out of date', path: 'src/old.ts', line: 80, onChangedCode: false })];
  return {
    slug: 'back/feat-x', baseline: { kind: 'submitted', at: new Date(Date.now() - 3 * 3_600_000).toISOString() },
    mr: { commits: 4, files: 7, commentedFilesTouched: 2 }, comments, newFindings, reworded: [], gone: [],
    counts: { addressed: 1, contested: 1, untouched: 1, dropped: 0, newFindings: 2, reworded: 0, gone: 0 }, ...over,
  };
};
