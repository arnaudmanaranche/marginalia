import type { Job } from './api';
import { contextRoute } from './contextApi';

// How a job reads in the list: what ran, how it stands, and how long it took. Pure.

export const WHAT: Record<Job['what'], string> = {
  review: 'Review',
  own: 'Own review',
  comments: 'Comment triage',
  understand: 'Learn the project',
};

export type JobTone = 'running' | 'done' | 'failed' | 'skipped';

export function stateOf(job: Job): { tone: JobTone; label: string } {
  if (job.outcome === 'running') {
    const stage = job.stages.find((s) => s.state === 'running');
    return { tone: 'running', label: stage ? stage.label : 'Starting' };
  }
  if (job.outcome === 'failed') return { tone: 'failed', label: job.failure?.title ?? 'Failed' };
  if (job.outcome === 'skipped') return { tone: 'skipped', label: 'Skipped' };
  return { tone: 'done', label: 'Done' };
}

// What it ran on: the MR or branch title when known, else the review's file name.
export function targetOf(job: Job): string {
  if (job.what === 'understand') return 'The whole project';
  if (job.title) return job.title;
  const file = job.slug.slice(job.slug.indexOf('/') + 1);
  return file.replace(/^(own-|mr-comments-)/, '');
}

export function durationOf(job: Job, now = Date.now()): string {
  const end = job.endedAt ? Date.parse(job.endedAt) : now;
  const s = Math.max(0, Math.round((end - Date.parse(job.startedAt)) / 1000));
  return s < 60 ? `${s}s` : s < 3600 ? `${Math.floor(s / 60)}m ${String(s % 60).padStart(2, '0')}s` : `${Math.floor(s / 3600)}h ${Math.floor((s % 3600) / 60)}m`;
}

// Where a job leads: the review it was about, or the project's context it learned.
export const routeOf = (job: Job) => (job.what === 'understand' ? contextRoute(job.project) : job.slug);

// Jobs that came without a title (a review run) take their MR's, so one MR reads the same in Activity
// as everywhere else.
export function withTitles(jobs: Job[], titleBySlug: ReadonlyMap<string, string>): Job[] {
  return jobs.map((j) => (j.title || !titleBySlug.has(j.slug) ? j : { ...j, title: titleBySlug.get(j.slug)! }));
}

// Why a failed job failed, to tell the same cause from another. An unknown failure shares a generic
// title: its own error tells it apart, and without one it is its own cause.
const causeOf = (job: Job) => (job.failure && job.failure.kind !== 'unknown' ? job.failure.title : job.error ?? `run ${job.id}`);

// Whether `job` repeats `last` for a reader: a skipped run of the same job, or a failure with the same
// cause on any MR (a logged-out agent or GitLab down fails every job the same way).
const repeats = (last: Job, job: Job) =>
  (job.outcome === 'skipped' && last.outcome === 'skipped' && last.slug === job.slug && last.what === job.what) ||
  (job.outcome === 'failed' && last.outcome === 'failed' && causeOf(job) === causeOf(last));

// Repeats back to back are one line with a count (and how many MRs they ran on): they would hide the
// runs that did something. The latest of each is the one shown.
export function collapseRepeats(jobs: Job[]): { job: Job; repeats: number; targets: number }[] {
  const out: { job: Job; repeats: number; slugs: Set<string> }[] = [];
  for (const job of jobs) {
    const last = out.at(-1);
    if (last && repeats(last.job, job)) {
      last.repeats++;
      last.slugs.add(job.slug);
    } else out.push({ job, repeats: 1, slugs: new Set([job.slug]) });
  }
  return out.map(({ job, repeats: n, slugs }) => ({ job, repeats: n, targets: slugs.size }));
}
