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
  // Once the stream has dropped (even before it ever opened), its next open catches up.
  let dropped = false;
  source.onmessage = () => void invalidateLive(client);
  source.onopen = () => {
    if (dropped) void invalidateLive(client);
    dropped = false;
    onLive(true);
  };
  source.onerror = () => {
    dropped = true;
    onLive(false);
  };
  return () => source.close();
}
