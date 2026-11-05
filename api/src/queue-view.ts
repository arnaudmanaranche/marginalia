import { MAX_ATTEMPTS, positions, type Task } from './queue-plan.ts';

// What the studio's queue shows (QueueView in the contract), from the tasks and the jobs, on plain
// values. One worker runs one task at a time, so the jobs a task started are the ones that began
// while it ran; a job of the CLI or the doctor may land there too, and says so by its project.

interface JobLike {
  slug: string; id: string; outcome: string; title: string | null; startedAt: string; endedAt: string | null;
  cost: { usd: number } | null;
}

const within = (at: string, task: Task, now: string) => task.startedAt !== null && at >= task.startedAt && at <= (task.endedAt ?? now);

export function queueView({ tasks, jobs, totals, now, current }: {
  tasks: Task[]; jobs: JobLike[]; totals: { done: number; failed: number }; now: string;
  current: { title: string; iid: number | string | null; project?: string } | null;
}) {
  const order = positions(tasks);
  const running = tasks.find((t) => t.status === 'running') ?? null;
  const detail = current ? `${current.project ? `${current.project} ` : ''}${current.iid !== null ? `!${current.iid} ` : ''}${current.title}` : null;
  return {
    now,
    workers: [{ id: 'bot', name: 'Bot', detail: running ? detail ?? running.label : null, taskId: running?.id ?? null }],
    tasks: tasks.map((t) => ({
      id: t.id, kind: t.kind, project: t.project, label: t.label, priority: t.priority, status: t.status,
      enqueuedAt: t.enqueuedAt, startedAt: t.startedAt, endedAt: t.endedAt, attempt: t.attempt, maxAttempts: MAX_ATTEMPTS,
      error: t.error, position: order.get(t.id) ?? null, detail: t.status === 'running' ? detail : null,
      jobs: jobs.filter((j) => within(j.startedAt, t, now)).map((j) => ({
        slug: j.slug, id: j.id, outcome: j.outcome, title: j.title, startedAt: j.startedAt, endedAt: j.endedAt, costUsd: j.cost?.usd ?? null,
      })),
    })),
    totals,
  };
}
