import { useQuery } from '@tanstack/react-query';
import { fetchJson } from './fetchRetry';

// The review line over the last weeks, computed by the bot (jobs, cost, what people did with the
// proposed comments). Under 'runs', so it follows the live events. Null while loading or on failure.
export interface LineMetrics {
  days: number;
  jobs: { total: number; failed: number; running: number; medianMs: number | null; costUsd: number };
  findings: { asProposed: number; edited: number; unknown: number; dismissed: number; pending: number; actedOnRate: number | null };
}

export function useLineMetrics(): LineMetrics | null {
  const query = useQuery({ queryKey: ['runs', '*', 'line', 'review'], queryFn: ({ signal }) => fetchJson<LineMetrics>('/api/lines/review/metrics', { signal }) });
  return query.data ?? null;
}

export const minutes = (ms: number | null) => (ms === null ? '–' : ms < 60_000 ? `${Math.round(ms / 1000)}s` : `${Math.round(ms / 60_000)}m`);
export const percent = (rate: number | null) => (rate === null ? '–' : `${Math.round(rate * 100)}%`);
