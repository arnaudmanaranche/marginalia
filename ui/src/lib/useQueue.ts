import { keys } from './queryKeys';
import type { QueueView } from './queue';
import { useJson } from './useJson';

// The bot's queue; kept current by the live events. Null while loading.
export function useQueue(): { queue: QueueView | null; error: string | null; retry: () => void } {
  const { data, error, retry } = useJson<QueueView>(keys.queue, '/api/queue?limit=100');
  return { queue: data, error, retry };
}
