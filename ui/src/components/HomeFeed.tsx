import { useMemo } from 'react';
import { Inbox, Sparkles } from 'lucide-react';
import type { ReviewItem } from '../lib/api';
import { APPROVALS_ROUTE } from '../lib/approvalsApi';
import { contextRoute } from '../lib/contextApi';
import { runningNow } from '../lib/feed';
import { WHAT, targetOf, withTitles } from '../lib/jobs';
import { useNeedsYou } from '../lib/useNeedsYou';
import { useQueue } from '../lib/useQueue';
import { StatusMark } from './ds/StatusMark';
import { FeedRow } from './FeedRow';
import { JobList } from './JobList';
import { JobRow } from './JobRow';
import { QueuePanel } from './QueuePanel';
import { ReviewRow } from './ReviewRow';

const list = 'divide-y divide-line overflow-hidden rounded-xl border border-line bg-surface';

// Home (ADR 0007): what needs you, what runs now, what happened. Everything waiting on a person comes
// first in one list; the jobs follow, live, then every job by day.
// `loaded`: the reviews have arrived. Before that nothing is claimed: no count, a quiet skeleton.
export function HomeFeed({ loaded, items, isUnread, isReviewing, isHeld, isNew, isChanged, showProject, onOpen, filter }: {
  loaded: boolean; items: ReviewItem[]; isUnread: (i: ReviewItem) => boolean; isReviewing: (i: ReviewItem) => boolean; isHeld: (i: ReviewItem) => boolean; isNew: (i: ReviewItem) => boolean; isChanged: (i: ReviewItem) => boolean;
  showProject: boolean; onOpen: (route: string | null) => void; filter?: React.ReactNode;
}) {
  const queue = useQueue();
  const { jobs: raw, proposals, drafts, reviews, failures, count } = useNeedsYou(items);
  const jobs = useMemo(() => (raw ? withTitles(raw, new Map(items.map((i) => [i.slug, i.title]))) : raw), [raw, items]);
  const running = jobs ? runningNow(jobs) : [];
  if (!loaded) {
    return (
      <div aria-busy="true" aria-label="Loading Home" className="mx-auto max-w-7xl px-6 py-8">
        <div className="h-9 w-64 animate-pulse rounded-lg bg-sunken motion-reduce:animate-none" />
        <div className="mt-8 h-48 animate-pulse rounded-xl border border-line motion-reduce:animate-none" />
      </div>
    );
  }
  return (
    <div className="mx-auto max-w-7xl px-6 py-8">
      <h1 className="text-3xl font-semibold tracking-tight">{count === 0 ? 'Nothing needs you' : `${count} thing${count > 1 ? 's' : ''} need${count > 1 ? '' : 's'} you`}</h1>
      <p className="mt-1 text-fg-muted">{running.length > 0 ? `${running.length} job${running.length > 1 ? 's' : ''} running.` : 'No job running.'}</p>
      {filter}

      {count > 0 && (
        <section aria-labelledby="needs-you" className="mt-6">
          <h2 id="needs-you" className="mb-2 text-sm font-medium">Needs you</h2>
          <ul className={list}>
            {proposals > 0 && <FeedRow mark={<Inbox className="size-4 text-run" aria-hidden />} title={`${proposals} proposed comment${proposals > 1 ? 's' : ''} to decide`} detail="Add each to your review, edited or not, or dismiss it" onOpen={() => onOpen(APPROVALS_ROUTE)} />}
            {failures.map((j) => <FeedRow key={j.slug} mark={<StatusMark state="failed" />} title={targetOf(j)} detail={`${j.failure?.title ?? 'Failed'} · ${WHAT[j.what]}`} onOpen={() => onOpen(j.slug)} />)}
            {drafts.map((c) => <FeedRow key={c.project} mark={<Sparkles className="size-4 text-run" aria-hidden />} title={`A new context for ${c.project}`} detail="Read it and approve it: reviews use the approved one" onOpen={() => onOpen(contextRoute(c.project))} />)}
            {/* Say it once: a reason is named on the first row of its run, not repeated on each. */}
            {reviews.map(({ item, reason }, i) => <ReviewRow key={item.slug} item={item} reason={i === 0 || reviews[i - 1].reason !== reason ? reason : undefined} unread={isUnread(item)} reviewing={isReviewing(item)} held={isHeld(item)} arrived={isNew(item)} changed={isChanged(item)} showProject={showProject} />)}
          </ul>
        </section>
      )}

      {running.length > 0 && (
        <section aria-labelledby="running" className="mt-8">
          <h2 id="running" className="mb-2 text-sm font-medium">Running now</h2>
          <ul className={list}>
            {running.map((j) => <JobRow key={`${j.slug}:${j.id}`} job={j} showProject={showProject} open={false} onToggle={() => onOpen(j.slug)} onOpen={onOpen} />)}
          </ul>
        </section>
      )}

      <section aria-labelledby="queue" className="mt-8">
        <h2 id="queue" className="mb-2 text-sm font-medium">Queue</h2>
        {queue.queue ? <QueuePanel queue={queue.queue} onOpen={onOpen} />
          : queue.error ? <p className="text-sm text-fg-muted">The queue could not be read: {queue.error}. <button type="button" className="underline" onClick={queue.retry}>Try again</button></p>
          : <div aria-busy="true" className="h-56 animate-pulse rounded-xl border border-line motion-reduce:animate-none" />}
      </section>

      <section aria-labelledby="activity" className="mt-8">
        <h2 id="activity" className="text-sm font-medium">Activity</h2>
        {jobs === null ? <div aria-busy="true" className="mt-6 h-40 animate-pulse rounded-xl border border-line motion-reduce:animate-none" />
          : jobs.length === 0 ? <p className="mt-4 text-sm text-fg-muted">Nothing has run yet. A review, a triage or learning a project shows here as it runs.</p>
          : <JobList jobs={jobs} showProject={showProject} onOpen={onOpen} />}
      </section>
    </div>
  );
}
