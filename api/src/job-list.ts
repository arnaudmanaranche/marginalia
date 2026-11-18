import { reviewDirs, traceIdsIn } from './run-dirs.ts';
import { RUNS_DIR, readTrace } from './run-journal.ts';
import { runSummary } from './run-trace.ts';
import { kindOf } from './review-kind.ts';

// The factory's jobs (ADR 0006): every run in the journal, across projects and reviews, newest
// first. A run id starts with its start time, so ids sort by time across folders without reading
// a trace; only the `limit` newest are read.
const ID = /^\d{4}-\d{2}-\d{2}T[\w-]+$/;

// `projects` are the project keys to list.
export async function listJobs(projects: string[], { limit = 50, root = RUNS_DIR, titles = new Map<string, string>() } = {}) {
  const found: { project: string; fileSlug: string; id: string }[] = [];
  for (const { project, review: fileSlug, dir } of await reviewDirs(root, projects)) {
    for (const id of await traceIdsIn(dir)) if (ID.test(id)) found.push({ project, fileSlug, id });
  }
  found.sort((a, b) => (a.id < b.id ? 1 : a.id > b.id ? -1 : 0));
  const traces = await Promise.all(found.slice(0, limit).map((f) => readTrace(f.project, f.fileSlug, f.id, root)));
  return traces.filter(Boolean).map((trace: any) => {
    const fileSlug = trace.slug.slice(trace.slug.indexOf('/') + 1);
    return {
      ...runSummary(trace),
      what: trace.kind === 'understand' ? 'understand' : kindOf(fileSlug),
      title: titles.get(trace.slug) ?? null,
    };
  });
}
