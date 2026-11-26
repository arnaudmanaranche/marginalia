import { useQuery } from '@tanstack/react-query';
import { fetchJson } from './fetchRetry';
import { keys } from './queryKeys';
import type { Finding } from './api';

// What changed on a re-reviewed MR since its baseline (GLOSSARY: Recap), as GET /api/reviews/:slug/recap
// gives it (Recap in the contract).
export type Standing = 'addressed' | 'contested' | 'untouched' | 'dropped';

export interface RecapSignals {
  // Null when the code cannot be compared: the version is gone, a collapsed file, no line.
  linesChanged: boolean | null;
  replied: boolean;
  resolved: boolean;
}

export interface RecapComment {
  findingId: string; title: string; path: string | null; line: number | null;
  standing: Standing; signals: RecapSignals; disagreement: boolean; url: string | null;
}

export interface RecapFinding {
  id: string; title: string; severity: Finding['severity']; path: string | null; line: number | null;
  // On code changed since the baseline; false is older code the bot only raised now; null cannot be told.
  onChangedCode: boolean | null;
}

export interface RecapCounts {
  addressed: number; contested: number; untouched: number; dropped: number;
  newFindings: number; reworded: number; gone: number;
}

export interface Recap {
  slug: string;
  baseline: { kind: 'submitted' | 'previous'; at: string };
  // Null when what changed in the code cannot be told: the version the baseline covered is gone.
  mr: { commits: number; files: number; commentedFilesTouched: number } | null;
  comments: RecapComment[];
  newFindings: RecapFinding[];
  reworded: { was: RecapFinding; now: RecapFinding }[];
  gone: RecapFinding[];
  counts: RecapCounts;
}

// The recap of one review, null while it loads, for a first review (nothing to compare) and when it
// cannot be read. It follows the review: a new report, a posted comment or an answered thread refresh it.
export function useRecap(slug: string | null, refreshKey?: string): { recap: Recap | null; loading: boolean } {
  const query = useQuery({
    queryKey: keys.recap(slug ?? '', refreshKey),
    enabled: slug !== null,
    queryFn: ({ signal }) => fetchJson<{ recap: Recap | null }>(`/api/reviews/${encodeURIComponent(slug!)}/recap`, { signal, retries: 0 }).then((b) => b.recap),
  });
  return { recap: query.data ?? null, loading: slug !== null && query.isPending };
}
