// What comes next in the bot's queue (GLOSSARY: Queue): when each waiting task should start and end
// and when a running one should end. An estimate, never a promise: it plays the line forward with
// the usual run time of each kind. Pure: the clock comes in as `now`.
import { isQuiet, lineOf, median, ranMs, type QueueTask, type QueueView } from './queue';

// A task's place on the clock ahead: `known` is false when nothing finished gave a usual time, or
// when a task before it in the line already ran past its own.
export interface Slot { start: number; end: number; known: boolean }
export interface Forecast { slots: Map<string, Slot>; until: number }

// A guess for what nothing has measured, so the line still has a shape; marked unknown.
const FALLBACK = 60_000;
// A running task past its usual time is said to end soon, not already over.
const SOON = 15_000;

const key = (project: string | null) => project ?? '';

// The usual run time of a running task of this kind. A poll that found nothing ends in seconds, so it
// says nothing of one that is running long: only the tasks that did something are counted.
export const usualRunOf = (tasks: QueueTask[], kind: string, now: number) =>
  median(tasks.filter((t) => t.kind === kind && t.status === 'done' && !isQuiet(t)).map((t) => ranMs(t, now) ?? 0));

// The usual run time of a waiting task of this kind: every finished one, quiet polls included,
// since a waiting poll most likely finds nothing too.
const usualWaitingOf = (tasks: QueueTask[], kind: string, now: number) =>
  median(tasks.filter((t) => t.kind === kind && t.status === 'done').map((t) => ranMs(t, now) ?? 0));

export function forecastOf(view: QueueView, now: number): Forecast {
  const { waiting, running } = lineOf(view.tasks);
  const slots = new Map<string, Slot>();
  const project = new Map<string, { at: number; known: boolean }>();
  const workers = Array.from({ length: Math.max(1, view.workers.length) }, () => ({ at: now, known: true }));
  running.forEach((t, i) => {
    const est = usualRunOf(view.tasks, t.kind, now);
    const start = t.startedAt ? Date.parse(t.startedAt) : now;
    const known = est !== null && start + est > now;
    const end = known ? start + est! : now + SOON;
    slots.set(t.id, { start, end, known });
    if (i < workers.length) workers[i] = { at: end, known };
    project.set(key(t.project), { at: end, known });
  });
  for (const t of waiting) {
    const est = usualWaitingOf(view.tasks, t.kind, now);
    // The worker that can start it first, once its project is free; on a tie the one that frees
    // last, so a worker free sooner stays for a task of another project.
    const busy = project.get(key(t.project));
    const startOn = (x: { at: number }) => Math.max(x.at, busy?.at ?? now);
    const w = workers.reduce((best, x, i) => {
      const [a, b] = [startOn(x), startOn(workers[best])];
      return a < b || (a === b && x.at > workers[best].at) ? i : best;
    }, 0);
    const after = busy && busy.at > workers[w].at ? busy : workers[w];
    const end = after.at + (est ?? FALLBACK);
    const known = est !== null && after.known;
    slots.set(t.id, { start: after.at, end, known });
    workers[w] = { at: end, known };
    project.set(key(t.project), { at: end, known });
  }
  return { slots, until: Math.max(now, ...[...slots.values()].map((s) => s.end)) };
}
