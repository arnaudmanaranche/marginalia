import type { QueryClient } from '@tanstack/react-query';
import { LIVE_KEYS } from './queryKeys';

// "changed" from the bot: what the page shows may be out of date.
export function invalidateLive(client: QueryClient) {
  return Promise.all(LIVE_KEYS.map((queryKey) => client.invalidateQueries({ queryKey })));
}

type Source = Pick<EventSource, 'onmessage' | 'onopen' | 'onerror' | 'close'>;

// Listens to the server's event stream until the returned function is called. `onLive` hears whether
// the stream is up: the browser reconnects by itself, and a reconnect catches up on what changed meanwhile.
export function listenToChanges(client: QueryClient, open: () => Source = () => new EventSource('/events'), onLive: (live: boolean) => void = () => {}) {
  const source = open();
  let opened = false;
  source.onmessage = () => void invalidateLive(client);
  source.onopen = () => {
    if (opened) void invalidateLive(client);
    opened = true;
    onLive(true);
  };
  source.onerror = () => onLive(false);
  return () => source.close();
}
