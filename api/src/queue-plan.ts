// The queue's rules on plain values: which task goes next, which one a new request joins, and what
// a restart does to the task it cut short. No database, no clock: queue.ts brings both.
//
// A task's lane is its project: two tasks of one project never run together (they share its bot
// worktree and state), two of different projects may, up to `workers` at once. A task of no
// project (a whole poll, from before lanes) runs alone.

export type Priority = 'high' | 'normal';
export type TaskStatus = 'queued' | 'running' | 'done' | 'failed';

export interface Task {
  id: string;
  kind: string;
  project: string | null;
  label: string;
  priority: Priority;
  status: TaskStatus;
  payload: any;
  // Two requests with the same key while the first still waits are one task.
  dedupe: string | null;
  enqueuedAt: string;
  startedAt: string | null;
  endedAt: string | null;
  attempt: number;
  error: string | null;
}

// A task a restart cut short is tried this many times in all, then it fails for good.
export const MAX_ATTEMPTS = 2;

const RANK: Record<Priority, number> = { high: 0, normal: 1 };

const inOrder = (tasks: Task[]) => tasks.filter((t) => t.status === 'queued')
  .sort((a, b) => RANK[a.priority] - RANK[b.priority] || a.enqueuedAt.localeCompare(b.enqueuedAt) || a.id.localeCompare(b.id));

// The next task that may start now: a person's request (high) before a poll (normal), then the
// oldest, skipping one whose lane is busy. Null when the workers are all taken or nothing may start.
export function nextTask(tasks: Task[], workers = 1): Task | null {
  const running = tasks.filter((t) => t.status === 'running');
  if (running.length >= workers || running.some((t) => t.project === null)) return null;
  const busy = new Set(running.map((t) => t.project));
  return inOrder(tasks).find((t) => (t.project === null ? running.length === 0 : !busy.has(t.project))) ?? null;
}

// The waiting task a new request with this key joins, or null. A running one is not joined: what
// it read may already be out of date, so the new request waits behind it.
export const waitingTwin = (tasks: Task[], dedupe: string | null): Task | null => (
  dedupe ? tasks.find((t) => t.status === 'queued' && t.dedupe === dedupe) ?? null : null
);

// What a task left running by a stopped process becomes: queued again for another attempt, or failed.
export function afterRestart(task: Task, now: string): Partial<Task> {
  if (task.attempt < MAX_ATTEMPTS) return { status: 'queued', startedAt: null, attempt: task.attempt + 1 };
  return { status: 'failed', endedAt: now, error: `Stopped by a restart ${task.attempt} times` };
}

// Where each task is in line (1 = first), for the queued ones only: the order they are taken in
// when lanes are free.
export const positions = (tasks: Task[]): Map<string, number> => new Map(inOrder(tasks).map((t, i) => [t.id, i + 1]));
