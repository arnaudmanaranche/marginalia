import type { Task } from './queue-plan.ts';

// The queries behind queue.ts, on a given database so they are tested on an in-memory one.
// Table `task` (db-schema.ts): every task waiting or running, and the latest finished ones.

// Finished tasks kept for the studio's queue; older ones are removed.
export const KEEP_FINISHED = 200;

const COLUMNS: [keyof Task, string][] = [
  ['id', 'id'], ['kind', 'kind'], ['project', 'project'], ['label', 'label'], ['priority', 'priority'],
  ['status', 'status'], ['payload', 'payload'], ['dedupe', 'dedupe'], ['enqueuedAt', 'enqueued_at'],
  ['startedAt', 'started_at'], ['endedAt', 'ended_at'], ['attempt', 'attempt'], ['error', 'error'],
];
const column = new Map(COLUMNS);

const fromRow = (row: any): Task => ({
  id: String(row.id), kind: String(row.kind), project: row.project ?? null, label: String(row.label),
  priority: row.priority, status: row.status, payload: JSON.parse(row.payload), dedupe: row.dedupe ?? null,
  enqueuedAt: String(row.enqueued_at), startedAt: row.started_at ?? null, endedAt: row.ended_at ?? null,
  attempt: Number(row.attempt), error: row.error ?? null,
});

const toValue = (key: keyof Task, value: any) => (key === 'payload' ? JSON.stringify(value ?? null) : value ?? null);

export function insertTask(db: any, task: Task) {
  db.prepare(`INSERT INTO task (${COLUMNS.map(([, c]) => c).join(', ')}) VALUES (${COLUMNS.map(() => '?').join(', ')})`)
    .run(...COLUMNS.map(([k]) => toValue(k, task[k])));
}

export function updateTask(db: any, id: string, patch: Partial<Task>) {
  const keys = (Object.keys(patch) as (keyof Task)[]).filter((k) => column.has(k) && k !== 'id');
  if (!keys.length) return;
  db.prepare(`UPDATE task SET ${keys.map((k) => `${column.get(k)} = ?`).join(', ')} WHERE id = ?`)
    .run(...keys.map((k) => toValue(k, patch[k])), id);
}

// Every task waiting or running.
export const openTasks = (db: any): Task[] => db.prepare("SELECT * FROM task WHERE status IN ('queued', 'running')").all().map(fromRow);

// The open tasks and the `limit` latest finished ones, newest first.
export function recentTasks(db: any, limit = 50): Task[] {
  const finished = db.prepare("SELECT * FROM task WHERE status IN ('done', 'failed') ORDER BY ended_at DESC LIMIT ?").all(limit).map(fromRow);
  return [...openTasks(db), ...finished];
}

export const countFinished = (db: any): { done: number; failed: number } => {
  const rows = db.prepare("SELECT status, COUNT(*) AS n FROM task WHERE status IN ('done', 'failed') GROUP BY status").all();
  const of = (s: string) => Number(rows.find((r: any) => r.status === s)?.n ?? 0);
  return { done: of('done'), failed: of('failed') };
};

export function pruneFinished(db: any, keep = KEEP_FINISHED) {
  db.prepare(`DELETE FROM task WHERE status IN ('done', 'failed') AND id NOT IN (
    SELECT id FROM task WHERE status IN ('done', 'failed') ORDER BY ended_at DESC LIMIT ?)`).run(keep);
}
