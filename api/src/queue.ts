import { randomUUID } from 'node:crypto';
import { afterRestart, nextTask, waitingTwin, type Priority, type Task } from './queue-plan.ts';
import { insertTask, openTasks, pruneFinished, updateTask } from './queue-store.ts';

// The bot's queue (GLOSSARY: Queue, Task): every task waits in the database, so a restart loses
// nothing, and up to `workers` run at once, one per project (queue-plan.ts says which goes next).
// The database comes in as a function, opened on first use.

export interface TaskRequest {
  kind: string;
  label: string;
  project?: string | null;
  priority?: Priority;
  payload?: any;
  dedupe?: string | null;
}

type Handler = (payload: any, task: Task) => Promise<unknown>;

export function createQueue({ db, workers = 1, now = () => new Date().toISOString(), newId = () => randomUUID() }: { db: () => any; workers?: number; now?: () => string; newId?: () => string }) {
  const handlers = new Map<string, Handler>();
  const waiters = new Map<string, { resolve: (v: unknown) => void; reject: (e: unknown) => void }[]>();
  const listeners = new Set<() => void>();
  let started = false;
  let running = 0;

  const changed = () => listeners.forEach((fn) => { try { fn(); } catch { /* a listener never stops the line */ } });
  const settle = (id: string, ok: boolean, value: unknown) => {
    for (const w of waiters.get(id) ?? []) (ok ? w.resolve : w.reject)(value);
    waiters.delete(id);
  };
  const wait = (id: string) => new Promise((resolve, reject) => {
    waiters.set(id, [...(waiters.get(id) ?? []), { resolve, reject }]);
  });

  // Marks the task running before its first await, so the next call to pump() sees its lane busy.
  async function runTask(task: Task) {
    updateTask(db(), task.id, { status: 'running', startedAt: now(), error: null });
    running += 1;
    changed();
    const handler = handlers.get(task.kind);
    try {
      if (!handler) throw new Error(`No handler for a "${task.kind}" task`);
      const value = await handler(task.payload, task);
      updateTask(db(), task.id, { status: 'done', endedAt: now() });
      settle(task.id, true, value);
    } catch (err) {
      updateTask(db(), task.id, { status: 'failed', endedAt: now(), error: String((err as Error)?.message ?? err).slice(0, 500) });
      settle(task.id, false, err);
    }
    running -= 1;
    pruneFinished(db());
    changed();
    pump();
  }

  // Starts every task that may start now; each one that ends calls it again.
  function pump() {
    if (!started) return;
    for (let task = nextTask(openTasks(db()), workers); task; task = nextTask(openTasks(db()), workers)) void runTask(task);
  }

  return {
    // What runs a kind of task. Registered before start(), by the module that owns the kind.
    handle(kind: string, handler: Handler) {
      handlers.set(kind, handler);
    },
    // Settles with what the handler returned, or rejects with its error. A request whose dedupe key
    // matches a waiting task joins it and settles with it.
    enqueue<T = unknown>(request: TaskRequest): Promise<T> {
      const twin = waitingTwin(openTasks(db()), request.dedupe ?? null);
      if (twin) return wait(twin.id) as Promise<T>;
      const task: Task = {
        id: newId(), kind: request.kind, project: request.project ?? null, label: request.label,
        priority: request.priority ?? 'normal', status: 'queued', payload: request.payload ?? {},
        dedupe: request.dedupe ?? null, enqueuedAt: now(), startedAt: null, endedAt: null, attempt: 1, error: null,
      };
      insertTask(db(), task);
      const done = wait(task.id);
      changed();
      pump();
      return done as Promise<T>;
    },
    // Tasks a stopped process left running are queued again (or failed), then the line starts.
    start() {
      if (started) return;
      for (const task of openTasks(db()).filter((t) => t.status === 'running')) updateTask(db(), task.id, afterRestart(task, now()));
      started = true;
      changed();
      pump();
    },
    onChange(fn: () => void) {
      listeners.add(fn);
      return () => listeners.delete(fn);
    },
    // How many tasks run right now, and how many may.
    get running() {
      return running;
    },
    workers,
  };
}

export type Queue = ReturnType<typeof createQueue>;
