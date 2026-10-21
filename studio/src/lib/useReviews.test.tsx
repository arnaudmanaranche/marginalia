// @vitest-environment jsdom
import type { ReactNode } from 'react';
import { QueryClientProvider } from '@tanstack/react-query';
import { act, renderHook, waitFor } from '@testing-library/react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { createQueryClient } from './queryClient';
import { reviewsRefetchInterval, useReview, useReviews } from './useReviews';

const answer = (status: number, body: unknown) => ({ ok: status < 300, status, json: async () => body });
const report = (md: string) => answer(200, { markdown: md, shape: { findings: [] } });

function setup() {
  const client = createQueryClient();
  const wrapper = ({ children }: { children: ReactNode }) => <QueryClientProvider client={client}>{children}</QueryClientProvider>;
  return { client, wrapper };
}

let fetchMock: ReturnType<typeof vi.fn>;
beforeEach(() => {
  fetchMock = vi.fn();
  vi.stubGlobal('fetch', fetchMock);
});
afterEach(() => {
  vi.unstubAllGlobals();
  vi.useRealTimers();
});

describe('reviewsRefetchInterval', () => {
  it('polls once loaded, tries again soon while nothing has loaded, and stops there otherwise', () => {
    expect(reviewsRefetchInterval({ data: {}, status: 'success' })).toBe(30_000);
    expect(reviewsRefetchInterval({ data: undefined, status: 'error' })).toBe(3000);
    expect(reviewsRefetchInterval({ data: undefined, status: 'pending' })).toBe(false);
  });
});

describe('useReviews', () => {
  it('keeps trying until the first answer: a restarting server does not leave the page empty', async () => {
    vi.useFakeTimers({ shouldAdvanceTime: true });
    fetchMock.mockRejectedValueOnce(new TypeError('network')).mockResolvedValue(answer(200, { items: [], projects: [] }));
    const { wrapper } = setup();
    const { result } = renderHook(() => useReviews(), { wrapper });
    await act(() => vi.advanceTimersByTimeAsync(500));
    await waitFor(() => expect(result.current.data).toEqual({ items: [], projects: [] }));
    expect(result.current.error).toBeNull();
    expect(fetchMock).toHaveBeenCalledTimes(2);
  });

  it('reports a final refusal as an error and has no data', async () => {
    fetchMock.mockResolvedValue(answer(404, { error: 'nope' }));
    const { wrapper } = setup();
    const { result } = renderHook(() => useReviews(), { wrapper });
    await waitFor(() => expect(result.current.error).toBe('nope'));
    expect(result.current.data).toBeNull();
  });

  it('reload asks the server again', async () => {
    fetchMock.mockResolvedValue(answer(200, { items: [] }));
    const { wrapper } = setup();
    const { result } = renderHook(() => useReviews(), { wrapper });
    await waitFor(() => expect(result.current.data).not.toBeNull());
    act(() => result.current.reload());
    await waitFor(() => expect(fetchMock).toHaveBeenCalledTimes(2));
  });
});

describe('useReview', () => {
  it('asks for the review by its URL-encoded slug', async () => {
    fetchMock.mockResolvedValue(report('one'));
    const { wrapper } = setup();
    const { result } = renderHook(() => useReview('back/a b.md', 'v1'), { wrapper });
    await waitFor(() => expect(result.current.content?.markdown).toBe('one'));
    expect(fetchMock.mock.calls[0][0]).toBe('/api/reviews/back%2Fa%20b.md');
  });

  it('never shows another review while the next one loads', async () => {
    let release!: (v: unknown) => void;
    fetchMock.mockResolvedValueOnce(report('first')).mockReturnValueOnce(new Promise((r) => (release = r)));
    const { wrapper } = setup();
    const { result, rerender } = renderHook(({ slug }) => useReview(slug, 'v1'), { wrapper, initialProps: { slug: 'p/a.md' } });
    await waitFor(() => expect(result.current.content?.markdown).toBe('first'));
    rerender({ slug: 'p/b.md' });
    expect(result.current.content).toBeNull();
    release(report('second'));
    await waitFor(() => expect(result.current.content?.markdown).toBe('second'));
  });

  it('keeps the old text of the same review while a new version loads', async () => {
    let release!: (v: unknown) => void;
    fetchMock.mockResolvedValueOnce(report('v1 text')).mockReturnValueOnce(new Promise((r) => (release = r)));
    const { wrapper } = setup();
    const { result, rerender } = renderHook(({ key }) => useReview('p/a.md', key), { wrapper, initialProps: { key: 'v1' } });
    await waitFor(() => expect(result.current.content?.markdown).toBe('v1 text'));
    rerender({ key: 'v2' });
    expect(result.current.content?.markdown).toBe('v1 text');
    release(report('v2 text'));
    await waitFor(() => expect(result.current.content?.markdown).toBe('v2 text'));
  });

  it('reads nothing without a slug', () => {
    const { wrapper } = setup();
    const { result } = renderHook(() => useReview(null, undefined), { wrapper });
    expect(result.current.content).toBeNull();
    expect(fetchMock).not.toHaveBeenCalled();
  });

  it('gives the error, then retry asks again', async () => {
    fetchMock.mockResolvedValueOnce(answer(404, { error: 'gone' })).mockResolvedValue(report('back'));
    const { wrapper } = setup();
    const { result } = renderHook(() => useReview('p/a.md', 'v1'), { wrapper });
    await waitFor(() => expect(result.current.error).toBe('gone'));
    act(() => result.current.retry());
    await waitFor(() => expect(result.current.content?.markdown).toBe('back'));
    expect(result.current.error).toBeNull();
  });
});
