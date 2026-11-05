import { History } from 'lucide-react';
import type { Job } from '../lib/api';
import { useJobs } from '../lib/useJobs';
import { JobRow } from './JobRow';
import { Button } from './ui/Button';

// Everything the bot ran, newest first, across projects and lines: the history of what happened
// and what is happening now (ADR 0006). Live: the list refetches on every change of the bot.
export function JobsPage({ jobs, error, onRetry, showProject, onOpen }: { jobs: Job[] | null; error: string | null; onRetry: () => void; showProject: boolean; onOpen: (slug: string) => void }) {
  const running = jobs?.filter((j) => j.outcome === 'running').length ?? 0;
  const failed = jobs?.filter((j) => j.outcome === 'failed').length ?? 0;
  return (
    <div className="mx-auto max-w-7xl px-6 py-8">
      <h1 className="text-3xl font-semibold tracking-tight">Jobs</h1>
      <p className="mt-1 text-fg-muted">
        {jobs && (jobs.length === 0 ? 'Nothing has run yet.' : `${running > 0 ? `${running} running. ` : ''}${failed > 0 ? `${failed} failed among the last ${jobs.length}.` : `The last ${jobs.length} runs.`}`)}
      </p>
      {error && !jobs ? (
        <div role="alert" className="mt-6 flex flex-wrap items-center gap-3 rounded-lg border border-line p-4 text-sm text-fg-muted">
          <span>The jobs could not be loaded ({error}).</span>
          <Button size="sm" onClick={onRetry}>Try again</Button>
        </div>
      ) : !jobs ? (
        <ul aria-busy="true" aria-label="Loading the jobs" className="mt-6 divide-y divide-line overflow-hidden rounded-xl border border-line">
          {[0, 1, 2, 3].map((i) => <li key={i} className="h-12 animate-pulse bg-sunken/50 motion-reduce:animate-none" />)}
        </ul>
      ) : jobs.length === 0 ? (
        <div className="mt-16 flex flex-col items-center gap-2 text-fg-muted"><History className="size-8" aria-hidden />No job yet. A review, a triage or learning a project shows here as it runs.</div>
      ) : (
        <ul className="mt-6 divide-y divide-line overflow-hidden rounded-xl border border-line bg-surface">
          {jobs.map((job) => <JobRow key={`${job.slug}:${job.id}`} job={job} showProject={showProject} onOpen={onOpen} />)}
        </ul>
      )}
    </div>
  );
}

// The page with its data: fetched only while it is open.
export function JobsView({ showProject, onOpen }: { showProject: boolean; onOpen: (slug: string) => void }) {
  const { jobs, error, retry } = useJobs();
  return <JobsPage jobs={jobs} error={error} onRetry={retry} showProject={showProject} onOpen={onOpen} />;
}
