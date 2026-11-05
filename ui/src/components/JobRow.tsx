import { AnimatePresence, m } from 'motion/react';
import { ChevronRight } from 'lucide-react';
import type { Job } from '../lib/api';
import { WHAT, durationOf, stateOf, targetOf, type JobTone } from '../lib/jobs';
import { unfold } from '../lib/motion';
import { spansOf } from '../lib/trace';
import { cn, timeAgo } from '../lib/utils';
import { Elapsed } from './ds/Elapsed';
import { SpanBar } from './ds/SpanBar';
import { StatusMark, type MarkState } from './ds/StatusMark';
import { JobTrace } from './JobTrace';

// Each job state as the design system's mark: the word beside it is the second code.
const MARK: Record<JobTone, MarkState> = { running: 'running', done: 'done', failed: 'failed', skipped: 'skipped' };
const TEXT: Record<JobTone, string> = { running: 'text-run', done: 'text-fg-muted', failed: 'text-fail', skipped: 'text-fg-muted' };

// One job as a line of a trace: its state, what it ran on, its stages as one bar (each as long as it
// took), when, how long and what it cost. It opens in place into its waterfall; a failed one says
// why on the line itself.
export function JobRow({ job, showProject, open, fresh = false, onToggle, onOpen }: { job: Job; showProject: boolean; open: boolean; fresh?: boolean; onToggle: () => void; onOpen: (route: string) => void }) {
  const state = stateOf(job);
  const { spans, total } = spansOf(job.stages, job.startedAt, Date.now());
  return (
    <li className={fresh ? 'animate-[job-in_0.6s_cubic-bezier(0.16,1,0.3,1)] motion-reduce:animate-none' : undefined}>
      <button type="button" onClick={onToggle} aria-expanded={open} className={cn('touch-target grid w-full grid-cols-[1rem_minmax(0,1fr)_auto] items-center gap-x-3 px-4 py-2.5 text-left transition-colors duration-150 sm:grid-cols-[1rem_minmax(0,1fr)_minmax(6rem,14rem)_5rem_4rem_3.5rem]', open ? 'bg-sunken/60' : 'hover:bg-sunken/40')}>
        <StatusMark state={MARK[state.tone]} label={state.label} />
        <span className="min-w-0">
          <span className="flex items-center gap-2 text-sm font-medium">
            <span className="truncate" title={targetOf(job)}>{targetOf(job)}</span>
            {fresh && <span className="shrink-0 rounded-full bg-run/10 px-1.5 py-px text-[10px] font-medium uppercase tracking-wide text-run">New</span>}
          </span>
          <span className="block truncate text-xs text-fg-muted">
            <span className={TEXT[state.tone]}>{state.tone === 'done' ? WHAT[job.what] : state.label}</span>
            {state.tone !== 'done' && ` · ${WHAT[job.what]}`}{job.iid !== null && ` · !${job.iid}`}{showProject && ` · ${job.project}`}
          </span>
        </span>
        <SpanBar spans={spans} total={total} className="hidden sm:block" />
        <span className="hidden text-right text-xs text-fg-muted sm:block" title={new Date(job.startedAt).toLocaleString()}>{timeAgo(job.startedAt)}</span>
        <span className="hidden text-right text-xs tabular-nums text-fg-muted sm:block">{job.outcome === 'running' ? <Elapsed from={job.startedAt} /> : durationOf(job)}</span>
        <span className="flex items-center justify-end gap-1 text-right text-xs tabular-nums text-fg-muted">
          {job.cost ? `$${job.cost.usd.toFixed(2)}` : '–'}
          <ChevronRight className={cn('size-3.5 shrink-0 transition-transform duration-200 motion-reduce:transition-none', open && 'rotate-90')} aria-hidden />
        </span>
      </button>
      <AnimatePresence initial={false}>
        {open && <m.div {...unfold} className="overflow-hidden border-t border-line"><JobTrace job={job} onOpen={onOpen} /></m.div>}
      </AnimatePresence>
    </li>
  );
}
