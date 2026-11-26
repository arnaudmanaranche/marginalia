import { describe, expect, it } from 'vitest';
import { recapComment, recapFinding, recapFixture } from '../components/recapFixture';
import { marksOf } from './recapMarks';

describe('the marks of a recap', () => {
  it('marks a finding I commented on with where its comment stands, and says what that rests on', () => {
    const marks = marksOf(recapFixture({ comments: [recapComment({ findingId: 'a', standing: 'contested', disagreement: true, signals: { linesChanged: false, replied: true, resolved: true } })] }));
    expect(marks.get('a')).toMatchObject({ label: 'contested', tone: 'warning' });
    expect(marks.get('a')!.title).toMatch(/Your comment · replied\. Resolved, but the code is untouched\./);
  });

  it('marks a new finding, and says whether it is on code the author changed', () => {
    const marks = marksOf(recapFixture({ comments: [], newFindings: [recapFinding({ id: 'n', onChangedCode: true }), recapFinding({ id: 'o', onChangedCode: false }), recapFinding({ id: 'u', onChangedCode: null })] }));
    expect(marks.get('n')).toMatchObject({ label: 'new', tone: 'info', title: 'New, on code changed since' });
    expect(marks.get('o')!.title).toMatch(/older code/);
    expect(marks.get('u')!.title).toBe('New');
  });

  it('asks about a reworded finding on the new one, naming the earlier one', () => {
    const marks = marksOf(recapFixture({ comments: [], newFindings: [], reworded: [{ was: recapFinding({ id: 'w', title: 'Total can be negative' }), now: recapFinding({ id: 'x' }) }] }));
    expect(marks.get('x')).toMatchObject({ label: 'reworded?' });
    expect(marks.get('x')!.title).toMatch(/Total can be negative/);
    expect(marks.has('w')).toBe(false);
  });

  it('leaves a finding that is simply still there unmarked, and a review with no recap too', () => {
    expect(marksOf(recapFixture({ comments: [], newFindings: [] })).size).toBe(0);
    expect(marksOf(null).size).toBe(0);
  });
});
