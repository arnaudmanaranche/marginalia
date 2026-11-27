import { useSyncExternalStore } from 'react';

// The reviews being sent to GitLab, by slug. Kept outside any component so a send started on one MR
// is still known after the reader moves to another, and back.
const sending = new Set<string>();
const listeners = new Set<() => void>();
const notify = () => listeners.forEach((l) => l());

export function trackSend<T>(slug: string, run: () => Promise<T>): Promise<T> {
  sending.add(slug);
  notify();
  return run().finally(() => {
    sending.delete(slug);
    notify();
  });
}

export const useSending = (slug: string | undefined) =>
  useSyncExternalStore((l) => { listeners.add(l); return () => { listeners.delete(l); }; }, () => (slug ? sending.has(slug) : false));
