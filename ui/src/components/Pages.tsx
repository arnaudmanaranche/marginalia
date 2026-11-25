import type { ReviewItem } from '../lib/api';
import { withTitles } from '../lib/jobs';
import { useJobs } from '../lib/useJobs';
import { useQueue } from '../lib/useQueue';
import { JobList } from './JobList';
import { QueuePanel } from './QueuePanel';

const page = 'mx-auto max-w-7xl px-4 py-8 sm:px-6';

function Title({ title, lead }: { title: string; lead: string }) {
  return (
    <header className="mb-6">
      <h1 className="text-2xl font-semibold tracking-tight">{title}</h1>
      <p className="mt-1 text-fg-muted">{lead}</p>
    </header>
  );
}

// Every job by day, each opening into its waterfall (ADR 0012: off Home, on its own page).
export function ActivityView({ items, onOpen }: { items: ReviewItem[]; onOpen: (route: string | null) => void }) {
  const { jobs, error, retry } = useJobs();
  const titles = new Map(items.map((i) => [i.slug, i.title]));
  const several = new Set(items.map((i) => i.project)).size > 1;
  return (
    <div className={page}>
      <Title title="Activity" lead="Every job the bot ran: reviews, triages and learning a project, by day." />
      {jobs ? (jobs.length === 0 ? <p className="text-sm text-fg-muted">Nothing has run yet. A review, a triage or learning a project shows here as it runs.</p> : <JobList jobs={withTitles(jobs, titles)} showProject={several} onOpen={onOpen} />)
        : error ? <p className="text-sm text-fg-muted">The jobs could not be read: {error}. <button type="button" className="underline" onClick={retry}>Try again</button></p>
        : <div aria-busy="true" className="h-64 animate-pulse rounded-xl border border-line motion-reduce:animate-none" />}
    </div>
  );
}

// The bot's queue on its own page (ADR 0012).
export function QueueScreen({ nextPollAt, onOpen }: { nextPollAt: string | null; onOpen: (route: string | null) => void }) {
  const queue = useQueue();
  return (
    <div className={page}>
      <Title title="Queue" lead="What the bot runs, what comes next and when, and what just ended." />
      {queue.queue ? <QueuePanel queue={queue.queue} nextPollAt={nextPollAt} onOpen={onOpen} />
        : queue.error ? <p className="text-sm text-fg-muted">The queue could not be read: {queue.error}. <button type="button" className="underline" onClick={queue.retry}>Try again</button></p>
        : <div aria-busy="true" className="h-56 animate-pulse rounded-xl border border-line motion-reduce:animate-none" />}
    </div>
  );
}
