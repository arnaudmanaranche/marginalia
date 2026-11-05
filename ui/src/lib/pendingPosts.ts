import { useEffect, useMemo, useSyncExternalStore } from 'react';
import { toast } from './toast';
import { MutationObserver } from '@tanstack/react-query';
import { postComment, type PostedInfo } from './api';
import { queryClient } from './queryClient';

// Comments being added to a pending review, shown as already there while GitLab answers.
// An entry stays until the server's own record has it (then that one wins), or goes on failure.
let entries: Record<string, PostedInfo> = {};
const listeners = new Set<() => void>();

function set(next: Record<string, PostedInfo>) {
  entries = next;
  listeners.forEach((l) => l());
}

function drop(key: string) {
  if (!(key in entries)) return;
  const { [key]: _gone, ...rest } = entries;
  set(rest);
}

function subscribe(l: () => void) {
  listeners.add(l);
  return () => listeners.delete(l);
}

export interface AddToReview {
  slug: string;
  iid: string | number;
  commentId: string;
  body: string;
  target?: { path: string; line?: number };
  reload: () => void;
}

// Returns at once: the comment shows "Adding…" until GitLab confirms, and a toast tells how it went.
export function addToReview(req: AddToReview) {
  const key = `${req.slug}:${req.commentId}`;
  if (entries[key]) return;
  set({ ...entries, [key]: { at: new Date().toISOString(), iid: Number(req.iid), url: '', state: 'draft', pending: true } });
  const toastId = toast.loading(`Adding to your pending review of !${req.iid}…`);
  // A mutation outside any component: the comment keeps going if the one that asked unmounts.
  const send = new MutationObserver(queryClient, { mutationFn: () => postComment(req.slug, req.commentId, req.body, req.target) });
  send.mutate().then(
    (posted) => {
      set({ ...entries, [key]: { ...posted, state: posted.state ?? 'draft' } });
      req.reload();
      if (req.target && posted.inline === false) toast.warning('Could not anchor it to the diff, added as a general comment');
      toast.success(`Added to your pending review of !${req.iid}`, { id: toastId, description: 'Submit the review to publish it.' });
    },
    (e) => {
      drop(key);
      toast.error('Could not add the comment', {
        id: toastId,
        description: (e as Error).message,
        action: { label: 'Retry', onClick: () => addToReview(req) },
      });
    },
  );
}

// The server's record of posted comments, plus the ones still on their way.
export function useMergedPosted(server: Record<string, PostedInfo>) {
  const local = useSyncExternalStore(subscribe, () => entries);
  // Once the server lists a comment, its record is the truth: forget the local one.
  useEffect(() => {
    const known = Object.keys(local).filter((k) => !local[k].pending && k in server);
    if (known.length) set(Object.fromEntries(Object.entries(entries).filter(([k]) => !known.includes(k))));
  }, [local, server]);
  return useMemo(() => (Object.keys(local).length ? { ...local, ...server } : server), [local, server]);
}
