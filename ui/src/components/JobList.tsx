import { useRef, useState } from 'react';
import { m } from 'motion/react';
import { arrive } from '../lib/motion';
import type { Job } from '../lib/api';
import { FILTERS, byDay, matches, type JobFilter } from '../lib/trace';
import { Segmented } from './ds/Segmented';
import { useFreshJobs } from '../lib/jobArrivals';
import { JobRow } from './JobRow';

// The jobs as a trace list: one filter row above, the jobs under the day they started, one opened
// at a time into its waterfall.
export function JobList({ jobs, showProject, onOpen }: { jobs: Job[]; showProject: boolean; onOpen: (route: string) => void }) {
  const [filter, setFilter] = useState<JobFilter>('all');
  const [open, setOpen] = useState<string | null>(null);
  // A shorter list would shrink the page under the reader and the browser would scroll it up: the
  // list keeps at least the height that still reaches the bottom of the window when it changes.
  const listRef = useRef<HTMLDivElement>(null);
  const [floor, setFloor] = useState(0);
  const choose = (next: JobFilter) => {
    const top = listRef.current?.getBoundingClientRect().top ?? window.innerHeight;
    setFloor(Math.max(0, window.innerHeight - top));
    setFilter(next);
  };
  const isFresh = useFreshJobs(jobs);
  const shown = jobs.filter((j) => matches(j, filter));
  const options = FILTERS.map((f) => ({ ...f, count: f.id === 'all' ? undefined : jobs.filter((j) => matches(j, f.id)).length }));
  return (
    <div className="mt-6">
      <Segmented label="Show jobs" options={options} value={filter} onChange={choose} />
      <div ref={listRef} style={{ minHeight: floor }}>
      {/* Keyed by the filter: the chosen jobs come in as a new line does (slide up 4px, fade in). */}
      <m.div key={filter} initial={arrive.initial} animate={arrive.animate}>
      {shown.length === 0 ? (
        <p className="mt-6 text-sm text-fg-muted">No {FILTERS.find((f) => f.id === filter)?.label.toLowerCase()} job among the last {jobs.length}.</p>
      ) : byDay(shown).map(({ day, jobs: those }) => (
        <section key={day} aria-label={day} className="mt-4">
          <h2 className="mb-1.5 text-xs font-medium text-fg-muted">{day}</h2>
          <ul className="divide-y divide-line overflow-hidden rounded-xl border border-line bg-surface">
            {those.map((job) => {
              const id = `${job.slug}:${job.id}`;
              return <JobRow key={id} job={job} showProject={showProject} fresh={isFresh(job)} open={open === id} onToggle={() => setOpen((o) => (o === id ? null : id))} onOpen={onOpen} />;
            })}
          </ul>
        </section>
      ))}
      </m.div>
      </div>
    </div>
  );
}
