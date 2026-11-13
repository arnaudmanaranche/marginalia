import { useState } from 'react';
import type { Job } from '../lib/api';
import { FILTERS, byDay, matches, type JobFilter } from '../lib/trace';
import { Segmented } from './ds/Segmented';
import { useFreshJobs } from '../lib/jobArrivals';
import { collapseRepeats } from '../lib/jobs';
import { JobRow } from './JobRow';

// The jobs as a trace list: one filter row above, the jobs under the day they started, one opened
// at a time into its waterfall.
export function JobList({ jobs, showProject, onOpen }: { jobs: Job[]; showProject: boolean; onOpen: (route: string) => void }) {
  const [filter, setFilter] = useState<JobFilter>('all');
  const [open, setOpen] = useState<string | null>(null);
  const isFresh = useFreshJobs(jobs);
  const shown = jobs.filter((j) => matches(j, filter));
  const options = FILTERS.map((f) => ({ ...f, count: f.id === 'all' ? undefined : jobs.filter((j) => matches(j, f.id)).length }));
  return (
    <div className="mt-6">
      <Segmented label="Show jobs" options={options} value={filter} onChange={setFilter} />
      {/* The counts are jobs (one run on one MR) over this window, retried failures included: not the queue's tasks, not what still needs you. */}
      <p className="mt-2 text-xs text-fg-muted">Counts over the last {jobs.length} jobs, failures since retried included.</p>
      {shown.length === 0 ? (
        <p className="mt-6 text-sm text-fg-muted">No {FILTERS.find((f) => f.id === filter)?.label.toLowerCase()} job among the last {jobs.length}.</p>
      ) : byDay(shown).map(({ day, jobs: those }) => (
        <section key={day} aria-label={day} className="mt-4">
          <h2 className="mb-1.5 text-xs font-medium text-fg-muted">{day}</h2>
          <ul className="divide-y divide-line overflow-hidden rounded-xl border border-line bg-surface">
            {collapseRepeats(those).map(({ job, repeats, targets }) => {
              const id = `${job.slug}:${job.id}`;
              return <JobRow key={id} job={job} repeats={repeats} targets={targets} showProject={showProject} fresh={isFresh(job)} open={open === id} onToggle={() => setOpen((o) => (o === id ? null : id))} onOpen={onOpen} />;
            })}
          </ul>
        </section>
      ))}
    </div>
  );
}
