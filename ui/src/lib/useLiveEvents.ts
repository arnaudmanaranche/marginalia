import { useEffect } from 'react';
import { useQueryClient } from '@tanstack/react-query';
import { listenToChanges } from './liveEvents';

// Keeps the page current: every "changed" event marks the live queries stale, and the ones on screen refetch.
export function useLiveEvents() {
  const client = useQueryClient();
  useEffect(() => listenToChanges(client), [client]);
}
