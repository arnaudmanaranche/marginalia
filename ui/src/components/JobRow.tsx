import type { Job } from '../lib/api';
import { WHAT, durationOf, routeOf, stateOf, targetOf, type JobTone } from '../lib/jobs';
import { cn, timeAgo } from '../lib/utils';
import { Elapsed } from './ds/Elapsed';
import { StatusMark, type MarkState } from './ds/StatusMark';

// Each job state as the design system's mark: the word beside it is the second code.
const MARK: Record<JobTone, MarkState> = { running: 'running', done: 'done', failed: 'failed', skipped: 'skipped' };
const TEXT: Record<JobTone, string> = { running: 'text-run', done: 'text-ok', failed: 'text-fail', skipped: 'text-fg-muted' };

// One job of the factory: what ran, on what, how it stands, when, how long and what it cost. A job
// opens what it was about (the review with its run's steps, or the project's context); a failed one says why.
export function JobRow({ job, showProject, onOpen }: { job: Job; showProject: boolean; onOpen: (slug: string) => void }) {
  const state = stateOf(job);
  const body = (
    <>
      <span className={cn('flex w-32 shrink-0 items-start gap-2 text-sm sm:w-48', TEXT[state.tone])}>
        <span className="mt-0.5"><StatusMark state={MARK[state.tone]} label={state.label} /></span>
        {/* A failure says why in full, on two lines at most; the raw error is in the tooltip. */}
        <span className="line-clamp-2 leading-snug" title={job.error ?? state.label}>{state.label}</span>
      </span>
      <span className="min-w-0 flex-1">
        <span className="block truncate text-sm font-medium" title={targetOf(job)}>{targetOf(job)}</span>
        <span className="block truncate text-xs text-fg-muted">
          {WHAT[job.what]}{job.iid !== null && ` · !${job.iid}`}{showProject && ` · ${job.project}`}
        </span>
      </span>
      <span className="hidden w-24 shrink-0 text-right text-xs text-fg-muted sm:block" title={new Date(job.startedAt).toLocaleString()}>{timeAgo(job.startedAt)}</span>
      <span className="hidden w-16 shrink-0 text-right text-xs tabular-nums text-fg-muted sm:block">{job.outcome === 'running' ? <Elapsed from={job.startedAt} /> : durationOf(job)}</span>
      <span className="w-14 shrink-0 text-right text-xs tabular-nums text-fg-muted">{job.cost ? `$${job.cost.usd.toFixed(2)}` : '–'}</span>
    </>
  );
  return (
    <li>
      <button type="button" onClick={() => onOpen(routeOf(job))} className="touch-target flex w-full items-center gap-4 px-4 py-2.5 text-left hover:bg-zinc-50 dark:hover:bg-zinc-800/60">{body}</button>
    </li>
  );
}
