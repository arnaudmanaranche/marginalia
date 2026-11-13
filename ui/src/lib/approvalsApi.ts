import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { fetchJson } from './fetchRetry';
import type { Finding } from './api';

// The approvals inbox: comments the factory proposes and nobody decided yet. Yes is adding one to
// the pending review (pendingPosts.ts), no is dismissing it here.
export interface Proposal {
  slug: string; project: string; iid: number; mrTitle: string; webUrl: string | null; reviewedAt: string | null;
  findingId: string; severity: Finding['severity']; title: string; body: string; path: string | null; line: number | null;
  comment: string; criticalPaths: string[];
}

export const APPROVALS_KEY = ['approvals'] as const;
export const APPROVALS_ROUTE = 'approvals';

export function useApprovals() {
  const query = useQuery({ queryKey: APPROVALS_KEY, queryFn: ({ signal }) => fetchJson<{ proposals: Proposal[]; canPost: boolean }>('/api/approvals', { signal }) });
  return { data: query.data ?? null, known: !query.isPending || query.isError, error: query.error ? String(query.error.message ?? query.error) : null, retry: () => void query.refetch() };
}

async function post(body: object) {
  const res = await fetch('/api/dismiss', { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify(body) });
  if (!res.ok) throw new Error(((await res.json().catch(() => ({}))) as { error?: string }).error ?? `HTTP ${res.status}`);
}

export function useDismiss() {
  const client = useQueryClient();
  const refresh = () => void client.invalidateQueries({ queryKey: APPROVALS_KEY });
  return useMutation({ mutationFn: (v: { slug: string; commentId: string; undo?: boolean }) => post(v), onSuccess: refresh });
}

// The proposals of one MR together, in the order they came.
export function byMergeRequest(proposals: Proposal[]) {
  const groups = new Map<string, Proposal[]>();
  for (const p of proposals) groups.set(p.slug, [...(groups.get(p.slug) ?? []), p]);
  return [...groups.values()];
}
