import type { Proposal } from './approvalsApi';
import { byMergeRequest } from './approvalsApi';

// The inbox's reading order and what is selected as decisions are made. Pure.
export const keyOf = (p: Pick<Proposal, 'slug' | 'findingId'>) => `${p.slug}:${p.findingId}`;

// Proposals in the order the list shows them: by MR, as they came.
export const ordered = (proposals: Proposal[]) => byMergeRequest(proposals).flat();

// The one to show: the selected one while it is still there, else the one that took its place (the
// next, or the last when it was the last), else the first.
export function selection(list: Proposal[], selected: string | null, previous: Proposal[] = []): Proposal | null {
  if (!list.length) return null;
  const kept = selected ? list.find((p) => keyOf(p) === selected) : null;
  if (kept) return kept;
  const was = previous.findIndex((p) => keyOf(p) === selected);
  if (was === -1) return list[0];
  const after = previous.slice(was + 1).find((p) => list.some((q) => keyOf(q) === keyOf(p)));
  return after ? list.find((q) => keyOf(q) === keyOf(after))! : list[list.length - 1];
}

// One step down (1) or up (-1), staying inside the list.
export function step(list: Proposal[], selected: string | null, by: 1 | -1): string | null {
  if (!list.length) return null;
  const at = list.findIndex((p) => keyOf(p) === selected);
  return keyOf(list[Math.min(list.length - 1, Math.max(0, (at === -1 ? 0 : at + by)))]);
}
