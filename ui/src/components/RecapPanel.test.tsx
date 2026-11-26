// @vitest-environment jsdom
import { cleanup, fireEvent, render, screen, within } from '@testing-library/react';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { RecapNotice } from './RecapNotice';
import { RecapPanel } from './RecapPanel';
import { recapFinding, recapFixture } from './recapFixture';

afterEach(cleanup);

describe('the recap panel', () => {
  it('is open on a re-review: what it is since, how my comments fared, and the MR line', () => {
    render(<RecapPanel recap={recapFixture()} />);
    expect(screen.getByText(/Since you submitted \(3h ago\)/)).toBeTruthy();
    expect(screen.getByText('1 contested')).toBeTruthy();
    expect(screen.getByText('4 commits, 7 files changed, 2 with your comments')).toBeTruthy();
    expect(screen.getByText('Your comments')).toBeTruthy();
  });

  it('lists what needs me first, and flags a thread resolved over code that did not change', () => {
    render(<RecapPanel recap={recapFixture()} />);
    const items = within(screen.getByText('Your comments').parentElement!).getAllByRole('listitem');
    expect(items[0].textContent).toMatch(/contested.*Handle the empty list/);
    expect(items[0].textContent).toMatch(/Resolved, but the code is untouched/);
    expect(items[2].textContent).toMatch(/addressed/);
  });

  it('puts new findings on changed code first and folds the older ones away', () => {
    render(<RecapPanel recap={recapFixture()} />);
    expect(screen.getByText('A race in the queue')).toBeTruthy();
    const older = screen.getByText(/On older code the bot only raised now \(1\)/).closest('details')!;
    expect(older.open).toBe(false);
  });

  it('closes and opens from its header, for a reader who wants the page', () => {
    render(<RecapPanel recap={recapFixture()} />);
    fireEvent.click(screen.getByRole('button', { expanded: true }));
    expect(screen.queryByText('Your comments')).toBeNull();
    expect(screen.getByRole('button', { expanded: false })).toBeTruthy();
  });

  it('says only what happened to the MR when there is nothing of mine, new or reworded', () => {
    render(<RecapPanel recap={recapFixture({ comments: [], newFindings: [], mr: { commits: 0, files: 0, commentedFilesTouched: 0 } })} />);
    expect(screen.getByText('Nothing was pushed since.')).toBeTruthy();
    expect(screen.queryByRole('button')).toBeNull();
  });

  it('says it cannot tell what changed, and does not claim older code, when the version is gone', () => {
    render(<RecapPanel recap={recapFixture({ mr: null, newFindings: [recapFinding({ onChangedCode: null })] })} />);
    expect(screen.getByText(/cannot be told/)).toBeTruthy();
    expect(screen.queryByText(/On older code/)).toBeNull();
  });

  it('asks about a reworded finding as a pair, never as new', () => {
    const was = recapFinding({ id: 'w', title: 'Total can be negative' });
    render(<RecapPanel recap={recapFixture({ newFindings: [], reworded: [{ was, now: recapFinding({ id: 'x', title: 'Coupon makes the total wrong' }) }] })} />);
    expect(screen.getByText('Reworded?')).toBeTruthy();
    expect(screen.getByText('Coupon makes the total wrong', { exact: false })).toBeTruthy();
    expect(screen.queryByText('New')).toBeNull();
  });

  it('folds away what the bot no longer raises, and does not call the panel quiet because of it', () => {
    render(<RecapPanel recap={recapFixture({ comments: [], newFindings: [], gone: [recapFinding({ id: 'g', title: 'An old worry' })] })} />);
    const gone = screen.getByText(/No longer raised \(1\)/).closest('details')!;
    expect(gone.open).toBe(false);
    expect(screen.getByRole('button', { expanded: true })).toBeTruthy();
  });
});

describe('the recap notice', () => {
  it('says a recap could not be read, with the reason and a way to ask again', () => {
    const retry = vi.fn();
    render(<RecapNotice loading={false} error="gitlab said no" retry={retry} />);
    expect(screen.getByRole('alert').textContent).toMatch(/could not be read \(gitlab said no\)/);
    fireEvent.click(screen.getByRole('button', { name: 'Try again' }));
    expect(retry).toHaveBeenCalledOnce();
  });

  it('keeps room while it loads, and says nothing otherwise', () => {
    const { container, rerender } = render(<RecapNotice loading error={null} retry={() => {}} />);
    expect(container.firstElementChild?.getAttribute('aria-hidden')).toBe('true');
    rerender(<RecapNotice loading={false} error={null} retry={() => {}} />);
    expect(container.firstElementChild).toBeNull();
  });
});
