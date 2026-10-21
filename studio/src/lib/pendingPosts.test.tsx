// @vitest-environment jsdom
import { act, renderHook, waitFor } from '@testing-library/react';
import { afterEach, describe, expect, it, vi } from 'vitest';

vi.mock('sonner', () => ({ toast: Object.assign(vi.fn(), { loading: vi.fn(() => 'id'), success: vi.fn(), error: vi.fn(), warning: vi.fn() }) }));

const answer = (status: number, body: unknown) => ({ ok: status < 300, status, json: async () => body });

afterEach(() => vi.unstubAllGlobals());

describe('addToReview', () => {
  it('shows the comment as pending at once, then as the server recorded it', async () => {
    const { addToReview, useMergedPosted } = await import('./pendingPosts');
    let finish!: (v: unknown) => void;
    const fetchMock = vi.fn(() => new Promise((r) => (finish = r)));
    vi.stubGlobal('fetch', fetchMock);
    const reload = vi.fn();
    const { result } = renderHook(() => useMergedPosted({}));
    act(() => addToReview({ slug: 'p/a.md', iid: 7, commentId: 'f1', body: 'text', reload }));
    expect(result.current['p/a.md:f1']).toMatchObject({ pending: true, state: 'draft', iid: 7 });
    await waitFor(() => expect(fetchMock).toHaveBeenCalled());
    finish(answer(200, { at: 'now', iid: 7, url: 'u', state: 'draft', inline: true }));
    await waitFor(() => expect(result.current['p/a.md:f1'].pending).toBeUndefined());
    expect(reload).toHaveBeenCalledOnce();
  });

  it('forgets the comment when GitLab refuses it', async () => {
    const { addToReview, useMergedPosted } = await import('./pendingPosts');
    vi.stubGlobal('fetch', vi.fn(async () => answer(422, { error: 'refused' })));
    const { result } = renderHook(() => useMergedPosted({}));
    act(() => addToReview({ slug: 'p/b.md', iid: 1, commentId: 'f2', body: 'text', reload: vi.fn() }));
    await waitFor(() => expect(result.current['p/b.md:f2']).toBeUndefined());
  });

  it('lets the server record win once it lists the comment', async () => {
    const { addToReview, useMergedPosted } = await import('./pendingPosts');
    vi.stubGlobal('fetch', vi.fn(async () => answer(200, { at: 'a', iid: 2, url: 'u' })));
    const server = { 'p/c.md:f3': { at: 'server', iid: 2, url: 'u', state: 'draft' as const } };
    const { result, rerender } = renderHook(({ s }) => useMergedPosted(s), { initialProps: { s: {} as typeof server } });
    act(() => addToReview({ slug: 'p/c.md', iid: 2, commentId: 'f3', body: 'text', reload: vi.fn() }));
    await waitFor(() => expect(result.current['p/c.md:f3']?.pending).toBeUndefined());
    rerender({ s: server });
    expect(result.current['p/c.md:f3'].at).toBe('server');
  });
});
