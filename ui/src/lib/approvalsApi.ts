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

export function useDismiss() {
  const client = useQueryClient();
  const refresh = () => void client.invalidateQueries({ queryKey: keys.approvals });
  return useMutation({ mutationFn: (v: { slug: string; commentId: string; undo?: boolean }) => sendJson('POST', '/api/dismiss', v), onSuccess: refresh });
}

// The proposals of one MR together, in the order they came.
export function byMergeRequest(proposals: Proposal[]) {
  const groups = new Map<string, Proposal[]>();
  for (const p of proposals) groups.set(p.slug, [...(groups.get(p.slug) ?? []), p]);
  return [...groups.values()];
}
