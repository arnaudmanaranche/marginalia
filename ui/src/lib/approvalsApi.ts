import { useMutation, useQueryClient } from '@tanstack/react-query';
import { sendJson } from './fetchRetry';
import { keys } from './queryKeys';
import { useJson } from './useJson';
import type { Finding } from './api';

// The approvals inbox: comments the factory proposes and nobody decided yet. Yes is adding one to
// the pending review (pendingPosts.ts), no is dismissing it here.
export interface Proposal {
  slug: string; project: string; iid: number; mrTitle: string; webUrl: string | null; reviewedAt: string | null;
  findingId: string; severity: Finding['severity']; title: string; body: string; path: string | null; line: number | null;
  comment: string; criticalPaths: string[];
}

export function useApprovals() {
  return useJson<{ proposals: Proposal[]; canPost: boolean }>(keys.approvals, '/api/approvals');
}

// What a dismissal makes stale: the inbox, and the recap of that review, where the comment is now dropped
// (or no longer, on undo). A local choice moves nothing in the status list, so the recap's own key does not.
export const staleAfterDismiss = (slug: string) => [keys.approvals, keys.recapOf(slug)];

export function useDismiss() {
  const client = useQueryClient();
  return useMutation({
    mutationFn: (v: { slug: string; commentId: string; undo?: boolean }) => sendJson('POST', '/api/dismiss', v),
    onSuccess: (_done, v) => { for (const queryKey of staleAfterDismiss(v.slug)) void client.invalidateQueries({ queryKey }); },
  });
}

// The proposals of one MR together, in the order they came.
export function byMergeRequest(proposals: Proposal[]) {
  const groups = new Map<string, Proposal[]>();
  for (const p of proposals) groups.set(p.slug, [...(groups.get(p.slug) ?? []), p]);
  return [...groups.values()];
}
