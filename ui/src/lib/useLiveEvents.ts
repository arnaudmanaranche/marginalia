import { useEffect, useState } from 'react';
import { useQueryClient } from '@tanstack/react-query';
import { listenToChanges } from './liveEvents';

// Keeps the page current: every "changed" event marks the live queries stale, and the ones on screen refetch.
// Returns whether the stream is up (true until it is known lost): without it the page only polls.
export function useLiveEvents(): boolean {
  const client = useQueryClient();
  const [live, setLive] = useState(true);
  useEffect(() => listenToChanges(client, undefined, setLive), [client]);
  return live;
}
