import { AnimatePresence, m } from 'motion/react';
import { ChevronRight } from 'lucide-react';
import { unfold } from '../lib/motion';
import { kindOf, progressOf, ranMs, waitedMs, type QueueTask, type TaskJob } from '../lib/queue';
import { duration } from '../lib/runs';
import { cn, timeAgo } from '../lib/utils';
import { StatusMark, type MarkState } from './ds/StatusMark';

const MARK: Record<QueueTask['status'], MarkState> = { queued: 'pending', running: 'running', done: 'done', failed: 'failed' };
const JOB_MARK: Record<TaskJob['outcome'], MarkState> = { running: 'running', reviewed: 'done', skipped: 'skipped', failed: 'failed' };
const clock = (iso: string | null) => (iso ? new Date(iso).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit', second: '2-digit' }) : '–');
const money = (usd: number) => `$${usd.toFixed(2)}`;
// An Understand job leads to the context it learned, any other to its review.
const routeOfJob = (j: TaskJob) => (j.slug.endsWith('/_context') ? `context:${j.slug.slice(0, -'/_context'.length)}` : j.slug);

// One task of the queue as a line: its state, what it is, where it stands (its place in line, the
// bar of a running one against the usual time of its kind, how an ended one went) and its times.
// It opens in place into a card with every fact the bot keeps on it and the jobs it started.
export function QueueTaskRow({ task, now, estimate, open, onToggle, onOpen }: {
  task: QueueTask; now: number; estimate: number | null; open: boolean; onToggle: () => void; onOpen: (route: string) => void;
}) {
  const ran = ranMs(task, now);
  const progress = task.status === 'running' ? progressOf(task, estimate, now) : null;
  const cost = task.jobs.reduce((s, j) => s + (j.costUsd ?? 0), 0);
  const facts = [kindOf(task), task.project, task.priority === 'high' && 'asked by a person', task.attempt > 1 && `attempt ${task.attempt} of ${task.maxAttempts}`,
    task.jobs.length > 0 && `${task.jobs.length} job${task.jobs.length > 1 ? 's' : ''}`, cost > 0 && money(cost)].filter(Boolean).join(' · ');
  return (
    <li>
      <button type="button" onClick={onToggle} aria-expanded={open} className={cn('touch-target grid w-full grid-cols-[1.5rem_1rem_minmax(0,1fr)_auto] items-center gap-x-3 px-4 py-2 text-left transition-colors duration-150', open ? 'bg-sunken/60' : 'hover:bg-sunken/40')}>
        <span className="text-right font-mono text-[11px] text-fg-muted">{task.position !== null ? `#${task.position}` : ''}</span>
        <StatusMark state={MARK[task.status]} />
        <span className="min-w-0">
          <span className="block truncate text-sm font-medium">{task.label}</span>
          <span className="block truncate text-xs text-fg-muted">
            {task.status === 'running' && task.detail ? <span className="text-run-ink">{task.detail} · </span> : null}
            {task.status === 'failed' && task.error ? <span className="text-fail">{task.error} · </span> : null}
            {facts}
          </span>
          {task.status === 'running' && (
            <span className="mt-1.5 block h-1 w-full overflow-hidden rounded-full bg-sunken" aria-hidden>
              <span className="shimmer block h-full rounded-full bg-run transition-[width] duration-1000" style={{ width: `${Math.max(4, (progress ?? 0.5) * 100)}%` }} />
            </span>
          )}
        </span>
        <span className="flex items-center gap-1 text-right text-xs tabular-nums text-fg-muted">
          {task.status === 'queued' ? `waiting ${duration(waitedMs(task, now))}` : task.status === 'running' ? duration(ran ?? 0) : <span title={task.endedAt ? new Date(task.endedAt).toLocaleString() : undefined}>{duration(ran ?? 0)} · {timeAgo(task.endedAt)}</span>}
          <ChevronRight className={cn('size-3.5 shrink-0 transition-transform duration-200 motion-reduce:transition-none', open && 'rotate-90')} aria-hidden />
        </span>
      </button>
      <AnimatePresence initial={false}>
        {open && (
          <m.div {...unfold} className="overflow-hidden border-t border-line bg-sunken/30">
            <dl className="grid grid-cols-2 gap-x-4 gap-y-1.5 px-4 py-3 text-xs sm:grid-cols-4">
              {([
                ['Asked', clock(task.enqueuedAt)], ['Waited', duration(waitedMs(task, now))],
                ['Started', clock(task.startedAt)], ['Ran', ran === null ? '–' : duration(ran)],
                ['Ended', clock(task.endedAt)], ['Usual time', estimate ? duration(estimate) : '–'],
                ['Attempt', `${task.attempt} of ${task.maxAttempts}`], ['Priority', task.priority === 'high' ? 'A person asked' : 'Poll'],
              ] as const).map(([k, v]) => (
                <div key={k} className="min-w-0"><dt className="text-fg-muted">{k}</dt><dd className="truncate tabular-nums">{v}</dd></div>
              ))}
            </dl>
            {task.error && <p className="mx-4 mb-3 rounded-md bg-fail/10 px-2 py-1.5 font-mono text-[11px] break-words text-fail">{task.error}</p>}
            {task.jobs.length > 0 ? (
              <ul className="mx-4 mb-3 divide-y divide-line rounded-lg border border-line bg-surface">
                {task.jobs.map((j) => (
                  <li key={`${j.slug}:${j.id}`}>
                    <button type="button" onClick={() => onOpen(routeOfJob(j))} className="touch-target grid w-full grid-cols-[1rem_minmax(0,1fr)_auto] items-center gap-x-2.5 px-3 py-1.5 text-left text-xs hover:bg-sunken/40">
                      <StatusMark state={JOB_MARK[j.outcome]} size={14} />
                      <span className="truncate" title={j.slug}>{j.title ?? j.slug.slice(j.slug.indexOf('/') + 1)}</span>
                      <span className="tabular-nums text-fg-muted">{duration((j.endedAt ? Date.parse(j.endedAt) : now) - Date.parse(j.startedAt))}{j.costUsd !== null && ` · ${money(j.costUsd)}`}</span>
                    </button>
                  </li>
                ))}
              </ul>
            ) : task.status !== 'queued' && <p className="mx-4 mb-3 text-xs text-fg-muted">{task.status === 'running' ? 'No job started yet.' : 'It started no job: nothing needed one.'}</p>}
          </m.div>
        )}
      </AnimatePresence>
    </li>
  );
}
