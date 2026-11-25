import { useMemo } from 'react';
import { Inbox, Sparkles } from 'lucide-react';
import type { ReviewItem } from '../lib/api';
import { greetingOf, notesOf, sinceSentence } from '../lib/briefing';
import { useContexts } from '../lib/contextApi';
import { rankNeedingYou, runningNow } from '../lib/feed';
import { APPROVALS_ROUTE, contextRoute } from '../lib/hashRoute';
import { WHAT, routeOf, targetOf, withTitles } from '../lib/jobs';
import { useLastVisit } from '../lib/lastVisit';
import { useMe } from '../lib/useMe';
import { useNeedsYou } from '../lib/useNeedsYou';
import { useNow } from '../lib/useNow';
import { useQueue } from '../lib/useQueue';
import { StatusMark } from './ds/StatusMark';
import { FeedRow } from './FeedRow';
import { HomeAside } from './HomeAside';
import { HomeBriefing } from './HomeBriefing';
import { JobRow } from './JobRow';
import { ReviewRow } from './ReviewRow';

const list = 'divide-y divide-line overflow-hidden rounded-xl border border-line bg-surface';

// Home (ADR 0007, 0012): a briefing (the greeting, what needs you, what changed since you last
// looked, the notes that stand out), then what needs you ranked by what matters and the jobs running
// now; beside it, the bot's day in brief. Every job by day is on Activity, the full queue on Queue.
// `loaded`: the reviews have arrived. Before that nothing is claimed: no count, a quiet skeleton.
// `titles`: every review's title by its id, across projects (the jobs listed are not filtered).
export function HomeFeed({ loaded, items, titles, isUnread, isReviewing, isHeld, isNew, isChanged, showProject, onOpen, filter, nextPollAt = null, projects = [] }: {
  loaded: boolean; items: ReviewItem[]; titles: ReadonlyMap<string, string>; isUnread: (i: ReviewItem) => boolean; isReviewing: (i: ReviewItem) => boolean; isHeld: (i: ReviewItem) => boolean; isNew: (i: ReviewItem) => boolean; isChanged: (i: ReviewItem) => boolean;
  showProject: boolean; onOpen: (route: string | null) => void; filter?: React.ReactNode; nextPollAt?: string | null; projects?: string[];
}) {
  const queue = useQueue();
  const me = useMe();
  const since = useLastVisit();
  const contexts = useContexts();
  const now = useNow(true);
  const { jobs: raw, proposals, drafts, reviews, failures: rawFailures, count, known } = useNeedsYou(items);
  // Jobs of every project take their MR's title, whatever the project filter shows (`titles`).
  const jobs = useMemo(() => (raw ? withTitles(raw, titles) : raw), [raw, titles]);
  const failures = useMemo(() => withTitles(rawFailures, titles), [rawFailures, titles]);
  const ranked = useMemo(() => rankNeedingYou(reviews), [reviews]);
  const running = jobs ? runningNow(jobs) : [];
  const quiet = known && count === 0 && running.length === 0;
  // The briefing reads the minute, not the second: it is rebuilt when the minute turns.
  const minute = Math.floor(now / 60_000);
  const briefing = useMemo(() => {
    const input = { now: minute * 60_000, since, items, jobs: jobs ?? [], budget: queue.queue?.budget ?? null, waiting: queue.queue?.tasks.filter((t) => t.status === 'queued').length ?? 0, contexts: contexts.contexts, projects };
    return { since: sinceSentence(input), notes: notesOf(input) };
  }, [minute, since, items, jobs, queue.queue, contexts.contexts, projects]);

  if (!loaded) {
    return (
      <div aria-busy="true" aria-label="Loading Home" className="mx-auto max-w-7xl px-6 py-8">
        <div className="h-9 w-96 max-w-full animate-pulse rounded-lg bg-sunken motion-reduce:animate-none" />
        <div className="mt-8 h-48 animate-pulse rounded-xl border border-line motion-reduce:animate-none" />
      </div>
    );
  }
  return (
    <div className="mx-auto max-w-7xl px-4 py-8 sm:px-6">
      {/* The briefing and what needs you on the left, the bot's day beside them from the top. With
          nothing to act on and nothing running, the bot's day takes the width under the briefing instead. */}
      <div className={quiet ? '' : 'grid items-start gap-x-8 gap-y-10 xl:grid-cols-[minmax(0,1fr)_22rem]'}>
        <div className="min-w-0 space-y-8">
          <HomeBriefing greeting={greetingOf(now, me?.name ?? null)} count={count} known={known} since={briefing.since} notes={briefing.notes} onOpen={onOpen} />
          {filter}
          {count > 0 && (
            <section aria-labelledby="needs-you">
              <h2 id="needs-you" className="mb-2 text-sm font-medium">Needs you <span className="font-normal text-fg-muted">· what matters most first</span></h2>
              <ul className={list}>
                {proposals > 0 && <FeedRow mark={<Inbox className="size-4 text-run" aria-hidden />} title={`${proposals} proposed comment${proposals > 1 ? 's' : ''} to decide`} detail="Add each to your review, edited or not, or dismiss it" onOpen={() => onOpen(APPROVALS_ROUTE)} />}
                {failures.map((j) => <FeedRow key={j.slug} mark={<StatusMark state="failed" />} title={targetOf(j)} detail={`${j.failure?.title ?? 'Failed'} · ${WHAT[j.what]}`} onOpen={() => onOpen(routeOf(j))} />)}
                {drafts.map((c) => <FeedRow key={c.project} mark={<Sparkles className="size-4 text-run" aria-hidden />} title={`A new context for ${c.project}`} detail="Read it and approve it: reviews use the approved one" onOpen={() => onOpen(contextRoute(c.project))} />)}
                {/* Ranked across kinds, so every row says why it is there. */}
                {ranked.map(({ item, reason }) => <ReviewRow key={item.slug} item={item} reason={reason} unread={isUnread(item)} reviewing={isReviewing(item)} held={isHeld(item)} arrived={isNew(item)} changed={isChanged(item)} showProject={showProject} />)}
              </ul>
            </section>
          )}
          {running.length > 0 && (
            <section aria-labelledby="running">
              <h2 id="running" className="mb-2 text-sm font-medium">Running now</h2>
              <ul className={list}>
                {running.map((j) => <JobRow key={`${j.slug}:${j.id}`} job={j} showProject={showProject} open={false} onToggle={() => onOpen(j.slug)} onOpen={onOpen} />)}
              </ul>
            </section>
          )}
        </div>
        <HomeAside wide={quiet} className={quiet ? "mt-10" : undefined} jobs={jobs} queue={queue.queue} nextPollAt={nextPollAt} now={now} onOpen={onOpen} />
      </div>
    </div>
  );
}
