import type { Job, RunStage } from './api';

// A job as spans and lists of jobs as the Jobs page shows them: filtered, grouped by day. Pure.

export interface Span { id: string; label: string; state: RunStage['state']; start: number; end: number }

// Each stage that started, as a span in ms from the run's start; one still going ends at `now`.
export function spansOf(stages: RunStage[], startedAt: string, now: number): { spans: Span[]; total: number } {
  const t0 = Date.parse(startedAt);
  const spans = stages
    .filter((s) => s.startedAt)
    .map((s) => ({ id: s.id, label: s.label, state: s.state, start: Date.parse(s.startedAt!) - t0, end: (s.endedAt ? Date.parse(s.endedAt) : now) - t0 }));
  const total = Math.max(1, ...spans.map((s) => s.end));
  return { spans, total };
}

export type JobFilter = 'all' | 'running' | 'failed' | 'review' | 'own' | 'understand';

export const FILTERS: { id: JobFilter; label: string }[] = [
  { id: 'all', label: 'All' },
  { id: 'running', label: 'Running' },
  { id: 'failed', label: 'Failed' },
  { id: 'review', label: 'Reviews' },
  { id: 'own', label: 'Own' },
  { id: 'understand', label: 'Learning' },
];

export function matches(job: Job, filter: JobFilter) {
  if (filter === 'all') return true;
  if (filter === 'running' || filter === 'failed') return job.outcome === filter;
  if (filter === 'review') return job.what === 'review' || job.what === 'comments';
  return job.what === filter;
}

// Jobs in order, under the day they started: "Today", "Yesterday", then the date.
export function byDay(jobs: Job[], now = Date.now()): { day: string; jobs: Job[] }[] {
  const dayOf = (iso: string) => new Date(iso).toDateString();
  const today = new Date(now).toDateString();
  const yesterday = new Date(now - 86_400_000).toDateString();
  const groups: { day: string; jobs: Job[] }[] = [];
  for (const job of jobs) {
    const d = dayOf(job.startedAt);
    const day = d === today ? 'Today' : d === yesterday ? 'Yesterday' : new Date(job.startedAt).toLocaleDateString(undefined, { weekday: 'short', day: 'numeric', month: 'short' });
    const last = groups[groups.length - 1];
    if (last?.day === day) last.jobs.push(job);
    else groups.push({ day, jobs: [job] });
  }
  return groups;
}
