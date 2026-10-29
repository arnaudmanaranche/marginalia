import type { QueryClient } from '@tanstack/react-query';
import { LIVE_KEYS } from './queryKeys';

// "changed" from the bot: what the page shows may be out of date.
export function invalidateLive(client: QueryClient) {
  return Promise.all(LIVE_KEYS.map((queryKey) => client.invalidateQueries({ queryKey })));
}

type Source = Pick<EventSource, 'onmessage' | 'close'>;

// Listens to the server's event stream until the returned function is called.
export function listenToChanges(client: QueryClient, open: () => Source = () => new EventSource('/events')) {
  const source = open();
  source.onmessage = () => void invalidateLive(client);
  return () => source.close();
}
