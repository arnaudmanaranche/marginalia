import type { Job } from './api';

// What running a job on this MR again will likely cost (USD): the median of its own recent paid runs,
// else of recent runs of the same kind; null when there are none. Pure.
const RECENT = 10;

const median = (xs: number[]) => {
  const s = [...xs].sort((a, b) => a - b);
  return s.length ? (s.length % 2 ? s[(s.length - 1) / 2] : (s[s.length / 2 - 1] + s[s.length / 2]) / 2) : null;
};

export function runEstimate(jobs: Job[], slug: string, what: string): number | null {
  const paid = jobs.filter((j) => j.outcome !== 'running' && (j.cost?.usd ?? 0) > 0);
  const own = paid.filter((j) => j.slug === slug);
  const pool = own.length ? own : paid.filter((j) => j.what === what);
  return median(pool.slice(0, RECENT).map((j) => j.cost!.usd));
}
