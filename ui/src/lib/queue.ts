// The bot's queue (GLOSSARY: Queue, Task), as GET /api/queue gives it (QueueView in the contract),
// and the measures the studio draws from it. Pure: the clock comes in as `now`.
import type { Budget } from './budget';

export type TaskStatus = 'queued' | 'running' | 'done' | 'failed';

export interface TaskJob {
  slug: string; id: string; outcome: 'running' | 'reviewed' | 'skipped' | 'failed';
  title: string | null; startedAt: string; endedAt: string | null; costUsd: number | null;
}

export interface QueueTask {
  id: string; kind: string; project: string | null; label: string; priority: 'high' | 'normal'; status: TaskStatus;
  enqueuedAt: string; startedAt: string | null; endedAt: string | null; attempt: number; maxAttempts: number;
  error: string | null; position: number | null; detail: string | null; jobs: TaskJob[];
}

export interface QueueWorker { id: string; name: string; detail: string | null; taskId: string | null }

export interface QueueView {
  now: string; workers: QueueWorker[]; tasks: QueueTask[]; totals: { done: number; failed: number };
  // Today's budget; null when the bot could not read it.
  budget: Budget | null;
}

// A kind of task in words.
export const KIND: Record<string, string> = { poll: 'Poll', mention: 'Mention', understand: 'Learn', rerun: 'Rerun' };
export const kindOf = (task: QueueTask) => KIND[task.kind] ?? task.kind;

// A depth that means the line is falling behind: above it, Waiting turns amber.
export const BACKPRESSURE = 5;

const ms = (iso: string) => Date.parse(iso);

// How long a task waited before it started, or has waited so far.
export const waitedMs = (t: QueueTask, now: number) => (t.startedAt ? ms(t.startedAt) : t.endedAt ? ms(t.endedAt) : now) - ms(t.enqueuedAt);
// How long it ran, or has run so far; null before it starts.
export const ranMs = (t: QueueTask, now: number) => (t.startedAt ? (t.endedAt ? ms(t.endedAt) : now) - ms(t.startedAt) : null);

export function median(values: number[]): number | null {
  if (!values.length) return null;
  const sorted = [...values].sort((a, b) => a - b);
  const mid = Math.floor(sorted.length / 2);
  return sorted.length % 2 ? sorted[mid] : (sorted[mid - 1] + sorted[mid]) / 2;
}

// The usual run time of a kind, from the finished ones: what a running task's bar is measured against.
export function estimateOf(tasks: QueueTask[], kind: string, now: number): number | null {
  return median(tasks.filter((t) => t.kind === kind && t.status === 'done').map((t) => ranMs(t, now) ?? 0));
}

// How far a running task is against its estimate, 0 to 0.95: it never claims to be done before it is.
export const progressOf = (t: QueueTask, estimate: number | null, now: number) => (
  estimate ? Math.min(0.95, (ranMs(t, now) ?? 0) / estimate) : null
);

export interface Measures { waiting: number; running: number; medianWait: number | null; medianRun: number | null; done: number; failed: number; costUsd: number }

export function measuresOf(view: QueueView, now: number): Measures {
  const started = view.tasks.filter((t) => t.startedAt);
  const ended = view.tasks.filter((t) => t.status === 'done' || t.status === 'failed');
  return {
    waiting: view.tasks.filter((t) => t.status === 'queued').length,
    running: view.tasks.filter((t) => t.status === 'running').length,
    medianWait: median(started.map((t) => waitedMs(t, now))),
    medianRun: median(ended.map((t) => ranMs(t, now) ?? 0)),
    // Over the tasks shown, the same ones as the Ended lane: the store keeps more than the page gets.
    done: ended.filter((t) => t.status === 'done').length,
    failed: ended.filter((t) => t.status === 'failed').length,
    costUsd: view.tasks.reduce((sum, t) => sum + t.jobs.reduce((s, j) => s + (j.costUsd ?? 0), 0), 0),
  };
}

// How many tasks waited at each of `points` moments over the last `window` ms, oldest first: a
// task waits from its enqueue to its start (or until now, or its end if it never started).
export function depthSeries(tasks: QueueTask[], now: number, window: number, points = 60): { at: number; depth: number }[] {
  const step = window / (points - 1);
  return Array.from({ length: points }, (_, i) => {
    const at = now - window + i * step;
    const depth = tasks.filter((t) => {
      const from = ms(t.enqueuedAt);
      const to = t.startedAt ? ms(t.startedAt) : t.endedAt ? ms(t.endedAt) : now;
      return from <= at && at < to;
    }).length;
    return { at, depth };
  });
}

// The tasks in the order a person reads the line: waiting by place, running, then ended newest first.
export function lineOf(tasks: QueueTask[]) {
  return {
    waiting: tasks.filter((t) => t.status === 'queued').sort((a, b) => (a.position ?? 0) - (b.position ?? 0)),
    running: tasks.filter((t) => t.status === 'running'),
    ended: tasks.filter((t) => t.status === 'done' || t.status === 'failed').sort((a, b) => (b.endedAt ?? '').localeCompare(a.endedAt ?? '')),
  };
}
