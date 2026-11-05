import { MAX_ATTEMPTS, positions, type Task } from './queue-plan.ts';

// What the studio's queue shows (QueueView in the contract), from the tasks and the jobs, on plain
// values. A project runs one task at a time, so the jobs a task started are the ones of its project
// that began while it ran (any project's, for a task of none); a job of the CLI or the doctor may
// land there too.

interface JobLike {
  slug: string; id: string; outcome: string; title: string | null; startedAt: string; endedAt: string | null;
  cost: { usd: number } | null;
}

interface Live { title: string; iid: number | string | null; project?: string }

const within = (at: string, task: Task, now: string) => task.startedAt !== null && at >= task.startedAt && at <= (task.endedAt ?? now);
const projectOfSlug = (slug: string) => slug.slice(0, slug.indexOf('/'));
const said = (c: Live) => `${c.project ? `${c.project} ` : ''}${c.iid !== null ? `!${c.iid} ` : ''}${c.title}`;

// `workers`: how many tasks may run at once. `live`: the MRs under review now, one per project.
export function queueView({ tasks, jobs, totals, now, workers, live }: {
  tasks: Task[]; jobs: JobLike[]; totals: { done: number; failed: number }; now: string; workers: number; live: Live[];
}) {
  const order = positions(tasks);
  const running = tasks.filter((t) => t.status === 'running');
  const detailOf = (t: Task) => {
    const c = t.project === null ? live.at(-1) : live.find((l) => l.project === t.project);
    return c ? said(c) : null;
  };
  return {
    now,
    workers: Array.from({ length: Math.max(workers, running.length) }, (_, i) => {
      const t = running[i];
      return { id: `w${i + 1}`, name: `Worker ${i + 1}`, detail: t ? detailOf(t) ?? t.label : null, taskId: t?.id ?? null };
    }),
    tasks: tasks.map((t) => ({
      id: t.id, kind: t.kind, project: t.project, label: t.label, priority: t.priority, status: t.status,
      enqueuedAt: t.enqueuedAt, startedAt: t.startedAt, endedAt: t.endedAt, attempt: t.attempt, maxAttempts: MAX_ATTEMPTS,
      error: t.error, position: order.get(t.id) ?? null, detail: t.status === 'running' ? detailOf(t) : null,
      jobs: jobs.filter((j) => within(j.startedAt, t, now) && (t.project === null || projectOfSlug(j.slug) === t.project)).map((j) => ({
        slug: j.slug, id: j.id, outcome: j.outcome, title: j.title, startedAt: j.startedAt, endedAt: j.endedAt, costUsd: j.cost?.usd ?? null,
      })),
    })),
    totals,
  };
}
