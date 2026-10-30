import { QueryClient } from '@tanstack/react-query';
import { describe, expect, it, vi } from 'vitest';
import { invalidateLive, listenToChanges } from './liveEvents';
import { keys } from './queryKeys';

function seeded() {
  const client = new QueryClient();
  const all = [keys.reviews, keys.review('p/a.md', 'v1'), keys.historyList('p/a.md', 'v1'), keys.historyVersion('p/a.md', 'x'), keys.threads('p/a.md', 'v1'), keys.diff('p/a.md', 's', 'full', null, 'v1'), keys.drafts('p/a.md')];
  for (const key of all) client.setQueryData(key, 1);
  const stale = (key: readonly unknown[]) => client.getQueryState(key)!.isInvalidated;
  return { client, stale };
}

describe('invalidateLive', () => {
  it('makes the list, the reports and their history stale', async () => {
    const { client, stale } = seeded();
    await invalidateLive(client);
    expect(stale(keys.reviews)).toBe(true);
    expect(stale(keys.review('p/a.md', 'v1'))).toBe(true);
    expect(stale(keys.historyList('p/a.md', 'v1'))).toBe(true);
    expect(stale(keys.historyVersion('p/a.md', 'x'))).toBe(true);
  });

  it('leaves what comes from GitLab alone: it follows the review version instead', async () => {
    const { client, stale } = seeded();
    await invalidateLive(client);
    expect(stale(keys.threads('p/a.md', 'v1'))).toBe(false);
    expect(stale(keys.diff('p/a.md', 's', 'full', null, 'v1'))).toBe(false);
    expect(stale(keys.drafts('p/a.md'))).toBe(false);
  });
});

describe('listenToChanges', () => {
  it('invalidates on every message and stops when asked', async () => {
    const { client, stale } = seeded();
    const source = { onmessage: null as ((e: never) => void) | null, close: vi.fn() };
    const stop = listenToChanges(client, () => source as never);
    source.onmessage!(undefined as never);
    await vi.waitFor(() => expect(stale(keys.reviews)).toBe(true));
    stop();
    expect(source.close).toHaveBeenCalledOnce();
  });
});
