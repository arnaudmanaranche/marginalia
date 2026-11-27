// @vitest-environment jsdom
import { describe, expect, it } from 'vitest';
import { trackSend } from './sending';
import { renderHook, act } from '@testing-library/react';
import { useSending } from './sending';

describe('the reviews being sent', () => {
  it('knows a slug is being sent until its request ends, whoever asks', async () => {
    let done!: () => void;
    const request = new Promise<void>((r) => { done = r; });
    const a = renderHook(() => useSending('a'));
    const b = renderHook(() => useSending('b'));
    let sent!: Promise<void>;
    act(() => { sent = trackSend('a', () => request); });
    expect(a.result.current).toBe(true);
    expect(b.result.current).toBe(false);
    await act(async () => { done(); await sent; });
    expect(a.result.current).toBe(false);
  });

  it('ends the tracking when the request fails too', async () => {
    const hook = renderHook(() => useSending('c'));
    await act(async () => { await trackSend('c', () => Promise.reject(new Error('502'))).catch(() => {}); });
    expect(hook.result.current).toBe(false);
  });
});
