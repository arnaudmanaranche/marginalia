// @vitest-environment jsdom
import { cleanup, render, screen } from '@testing-library/react';
import { afterEach, describe, expect, it } from 'vitest';
import { marksOf } from '../lib/recapMarks';
import { RecapMarksContext } from '../lib/reviewContexts';
import { RecapMark } from './RecapMark';
import { recapFinding, recapFixture } from './recapFixture';

afterEach(cleanup);

const withMarks = (id: string) => render(
  <RecapMarksContext.Provider value={marksOf(recapFixture({ newFindings: [recapFinding({ id: 'n' })] }))}><RecapMark id={id} /></RecapMarksContext.Provider>,
);

describe('the recap mark of a finding', () => {
  it('wears its badge in words, with what it rests on in the tooltip', () => {
    withMarks('n');
    const badge = screen.getByText('new');
    expect(badge.getAttribute('title')).toBe('New, on code changed since');
  });

  it('says the standing of a comment of mine', () => {
    withMarks('b');
    expect(screen.getByText('contested').getAttribute('title')).toMatch(/Resolved, but the code is untouched/);
  });

  it('wears nothing when the recap has nothing to say of the finding, or there is no recap', () => {
    const { container } = withMarks('unmarked');
    expect(container.firstElementChild).toBeNull();
    cleanup();
    const bare = render(<RecapMark id="n" />);
    expect(bare.container.firstElementChild).toBeNull();
  });
});
