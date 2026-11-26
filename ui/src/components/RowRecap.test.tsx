// @vitest-environment jsdom
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { cleanup, render, screen, waitFor } from '@testing-library/react';
import { afterEach, describe, expect, it, vi } from 'vitest';
import type { ReviewItem } from '../lib/api';
import { RecapLine, RowRecap } from './RowRecap';
import { recapFixture } from './recapFixture';

afterEach(() => { cleanup(); vi.unstubAllGlobals(); });

const item = { slug: 'back/feat-x', tracked: true, reviewedAt: 'r1', myState: { myActivityAt: null, authorActivityAt: null, peerActivityAt: null, lastPushAt: null, unresolved: 0 } } as unknown as ReviewItem;
const mount = (i: ReviewItem) => render(<QueryClientProvider client={new QueryClient({ defaultOptions: { queries: { retry: false } } })}><RowRecap item={i} /></QueryClientProvider>);
const answer = (status: number, body: unknown) => vi.fn(async (_url: string) => ({ ok: status < 300, status, json: async () => body, text: async () => JSON.stringify(body) }));

describe('the recap line of a row', () => {
  it('says how my comments fared and what is new, in the words of the panel', () => {
    render(<RecapLine recap={recapFixture()} />);
    expect(screen.getByText('1 addressed · 1 contested · 1 untouched · 2 new')).toBeTruthy();
  });

  it('says what it is since in its tooltip, and nothing at all when there is nothing to say', () => {
    const { container } = render(<RecapLine recap={recapFixture()} />);
    expect(container.firstElementChild?.getAttribute('title')).toMatch(/^Since you submitted/);
    cleanup();
    expect(render(<RecapLine recap={recapFixture({ comments: [], newFindings: [] })} />).container.firstElementChild).toBeNull();
  });

  it('reads the recap of its own review, once', async () => {
    const fetchMock = answer(200, { recap: recapFixture() });
    vi.stubGlobal('fetch', fetchMock);
    mount(item);
    await waitFor(() => expect(screen.getByText(/2 new/)).toBeTruthy());
    expect(fetchMock).toHaveBeenCalledTimes(1);
    expect(String(fetchMock.mock.calls[0][0])).toBe('/api/reviews/back%2Ffeat-x/recap');
  });

  it('shows nothing when the recap cannot be read: the row is not the place for the reason', async () => {
    vi.stubGlobal('fetch', answer(502, { error: 'gitlab down' }));
    const { container } = mount(item);
    await waitFor(() => expect(globalThis.fetch).toHaveBeenCalled());
    expect(container.firstElementChild).toBeNull();
  });

  it('asks for nothing for an MR the bot does not track', () => {
    const fetchMock = answer(200, { recap: null });
    vi.stubGlobal('fetch', fetchMock);
    mount({ ...item, tracked: false } as ReviewItem);
    expect(fetchMock).not.toHaveBeenCalled();
  });
});
