import { CircleCheck, CircleSlash, Loader2, TriangleAlert } from 'lucide-react';
import type { Job } from '../lib/api';
import { WHAT, durationOf, opensReview, stateOf, targetOf, type JobTone } from '../lib/jobs';
import { cn, timeAgo } from '../lib/utils';

// How each state is double-coded: an icon and a word, the colour backing them up.
const TONE: Record<JobTone, { icon: typeof CircleCheck; className: string }> = {
  running: { icon: Loader2, className: 'text-blue-600 dark:text-blue-400' },
  done: { icon: CircleCheck, className: 'text-emerald-600 dark:text-emerald-400' },
  failed: { icon: TriangleAlert, className: 'text-red-600 dark:text-red-400' },
  skipped: { icon: CircleSlash, className: 'text-fg-muted' },
};

// One job of the factory: what ran, on what, how it stands, when, how long and what it cost. A job
// about a review opens it, where the run's steps are; a failed one says why.
export function JobRow({ job, showProject, onOpen }: { job: Job; showProject: boolean; onOpen: (slug: string) => void }) {
  const state = stateOf(job);
  const { icon: Icon, className } = TONE[state.tone];
  const body = (
    <>
      <span className={cn('flex w-32 shrink-0 items-center gap-2 text-sm sm:w-48', className)}>
        <Icon aria-hidden className={cn('size-4 shrink-0', state.tone === 'running' && 'animate-spin motion-reduce:animate-pulse')} />
        <span className="truncate" title={job.error ?? state.label}>{state.label}</span>
      </span>
      <span className="min-w-0 flex-1">
        <span className="block truncate text-sm font-medium" title={targetOf(job)}>{targetOf(job)}</span>
        <span className="block truncate text-xs text-fg-muted">
          {WHAT[job.what]}{job.iid !== null && ` · !${job.iid}`}{showProject && ` · ${job.project}`}
        </span>
      </span>
      <span className="hidden w-24 shrink-0 text-right text-xs text-fg-muted sm:block" title={new Date(job.startedAt).toLocaleString()}>{timeAgo(job.startedAt)}</span>
      <span className="hidden w-16 shrink-0 text-right text-xs tabular-nums text-fg-muted sm:block">{durationOf(job)}</span>
      <span className="w-14 shrink-0 text-right text-xs tabular-nums text-fg-muted">{job.cost ? `$${job.cost.usd.toFixed(2)}` : '–'}</span>
    </>
  );
  const row = 'flex w-full items-center gap-4 px-4 py-2.5 text-left';
  return (
    <li>
      {opensReview(job)
        ? <button type="button" onClick={() => onOpen(job.slug)} className={cn(row, 'touch-target hover:bg-zinc-50 dark:hover:bg-zinc-800/60')}>{body}</button>
        : <div className={row}>{body}</div>}
    </li>
  );
}
