import { useEffect, useMemo, useState } from 'react';
import { LazyMotion, MotionConfig } from 'motion/react';
import { Toaster } from 'sonner';
import { toast } from './lib/toast';
import type { ReviewItem } from './lib/api';
import { useReviews } from './lib/useReviews';
import { useLiveEvents } from './lib/useLiveEvents';
import { useArrivals } from './lib/arrivals';
import { useSoundCues } from './lib/useSoundCues';
import { ALL_PROJECTS, activeFilter, filterByProject, filterOptions, hasSeveralProjects } from './lib/projects';
import { useMergedPosted } from './lib/pendingPosts';
import { useNeedsYou } from './lib/useNeedsYou';
import { usePersistentState, useOpenTabs } from './lib/layout';
import { KEY_PREFIX } from './lib/storage';
import { botBySlug } from './lib/botState';
import { postedFor } from './lib/postedKey';
import { StatusBar } from './components/StatusBar';
import { TabStrip } from './components/TabStrip';
import { HomeFeed } from './components/HomeFeed';
import { ProjectFilter } from './components/ProjectFilter';
import { Screen, loadReader } from './components/Screen';
import { CommandPalette } from './components/CommandPalette';
import { TipLayer } from './components/ds/TipLayer';
import { Crashed } from './components/Crashed';
import { useApprovals } from './lib/approvalsApi';
import { liveRunOf } from './lib/liveRun';
import { useTheme } from './lib/theme';
import { APPROVALS_ROUTE, JOBS_ROUTE, SETTINGS_ROUTE, contextKeyOf, hrefOf } from './lib/hashRoute';
import { useHashRoute } from './lib/useHashRoute';
import { useSeen } from './lib/useSeen';
import { useCloseTabShortcut } from './lib/useCloseTabShortcut';
import { LinkContext } from './lib/links';
import { ticketLinks } from './lib/tickets';
import { palettePages } from './lib/palettePages';

const EMPTY_POSTED = {};
// The animation features load after the first paint; until then `m` components just render.
const loadMotionFeatures = () => import('./lib/motionFeatures').then((mod) => mod.default);

export function App() {
  const streaming = useLiveEvents();
  const { data, error, updatedAt, reload } = useReviews();
  const [projectFilter, setProjectFilter] = usePersistentState(`${KEY_PREFIX}project-filter`, ALL_PROJECTS);
  const posted = useMergedPosted(data?.posted ?? EMPTY_POSTED);
  const { slug, finding, path: focusPath, version } = useHashRoute();
  const [palette, setPalette] = useState(false);

  useEffect(() => {
    if (error) toast.error('Studio API unreachable', { id: 'api-error', description: error, duration: Infinity });
    else toast.dismiss('api-error');
  }, [error]);

  // Fetch the reader in the background once Home is up, so the first review opens instantly.
  useEffect(() => {
    const t = setTimeout(() => void loadReader(), 1200);
    return () => clearTimeout(t);
  }, []);


  const items = useMemo(() => data?.items ?? [], [data]);
  // Ticket keys link to the tracker on every screen; a review adds its own MR's links (ReviewReader).
  const links = useMemo(() => ({ projectUrl: null, branch: null, mrWebUrl: null, tickets: ticketLinks(data?.jiraBaseUrl ?? null, items) }), [data?.jiraBaseUrl, items]);
  // A review that came in (a poll found a new MR) or changed (a new report, queued, failed) while the page is open shows it.
  const entries = useMemo(() => (data ? data.items.map((i) => [i.slug, `${i.reviewedAt}|${i.verdict}|${i.awaiting ?? ''}`] as const) : null), [data]);
  const fresh = useArrivals(entries);
  useSoundCues(data?.items, data?.status ?? null);
  const isNew = (i: ReviewItem) => fresh.arrived(i.slug);
  const isChanged = (i: ReviewItem) => fresh.changed(i.slug);
  const known = useMemo(() => (data ? new Set(data.items.map((i) => i.slug)) : null), [data]);
  const { tabs: openSlugs, close: closeTab } = useOpenTabs(slug, known);
  const tabItems = openSlugs.map((s) => items.find((i) => i.slug === s)).filter((i): i is ReviewItem => Boolean(i));
  const bots = useMemo(() => botBySlug(data?.status?.mrs), [data]);
  // The bot is reviewing it right now: its row is disabled until the new report is written.
  const isReviewing = (i: ReviewItem) => bots.get(i.slug) === 'reviewing' || liveRunOf(data?.status, i) !== null;
  const isHeld = (i: ReviewItem) => bots.get(i.slug) === 'held';
  const isPosted = (i: ReviewItem) => postedFor(posted, i.slug).length > 0;
  const current = items.find((i) => i.slug === slug);

  const { isUnread } = useSeen(current);
  const projects = data?.projects;
  const several = hasSeveralProjects(projects);
  const approvalCount = useApprovals().data?.proposals.length ?? 0;
  const pages = useMemo(() => palettePages(projects ?? []), [projects]);
  const titles = useMemo(() => new Map(items.map((i) => [i.slug, i.title])), [items]);
  const filter = activeFilter(projectFilter, projects);
  const shown = useMemo(() => filterByProject(items, filter, projects), [items, filter, projects]);
  // The Home tab counts what waits on you in every project, whatever the filter hides.
  const needsYou = useNeedsYou(items);
  // The Home tab says a number once it is the whole one.
  const waitingAll = needsYou.known ? needsYou.count : 0;

  const [theme] = useTheme();
  const go = (s: string | null) => {
    // The new screen starts at the top (useHashRoute): scrolling here would move the one being left.
    location.hash = s ? hrefOf(s) : '';
  };
  const close = (s: string) => {
    const next = closeTab(s);
    if (s === slug) go(next);
  };

  useCloseTabShortcut(slug, palette, close);
  useEffect(() => { if (slug === JOBS_ROUTE) go(null); }, [slug]);

  return (
    <MotionConfig reducedMotion="user">
    <LazyMotion features={loadMotionFeatures} strict>
      <Toaster position="bottom-right" theme={theme} richColors />
      <header className="sticky top-0 z-40 bg-canvas">
        <StatusBar status={data?.status ?? null} connection={error ? 'unreachable' : data ? 'ok' : 'connecting'} shownSince={data ? updatedAt : null} streaming={streaming} settingsActive={slug === SETTINGS_ROUTE || Boolean(contextKeyOf(slug))} approvalsActive={slug === APPROVALS_ROUTE} approvals={approvalCount} onApprovals={() => go(APPROVALS_ROUTE)} onOpenPalette={() => setPalette(true)} onHome={() => go(null)} onSettings={() => go(SETTINGS_ROUTE)} />
        <TabStrip
          tabs={tabItems}
          activeSlug={slug}
          botBySlug={bots}
          isUnread={isUnread}
          isPosted={isPosted}
          homeUnread={waitingAll}
          onSelect={go}
          onClose={close}
        />
      </header>
      <TipLayer />
      <CommandPalette open={palette} setOpen={setPalette} items={items} pages={pages} onSelect={go} />

      <LinkContext.Provider value={links}>
      <div className="flex">
        <main className="min-w-0 flex-1">
      {/* A screen that fails to render says so in its place; the bar and the tabs stay. */}
      <Crashed resetKey={slug}>
      <Screen
        route={{ slug, finding, path: focusPath, version }} data={data} items={items} posted={posted} reload={reload} isPosted={isPosted} onOpen={go}
        home={(
          <HomeFeed
            loaded={Boolean(data)} items={shown} titles={titles} isUnread={isUnread} isReviewing={isReviewing} isHeld={isHeld} isNew={isNew} isChanged={isChanged} showProject={several} onOpen={go}
            filter={several ? <ProjectFilter options={filterOptions(projects)} value={filter} onChange={setProjectFilter} /> : undefined}
          />
        )}
      />
      </Crashed>
        </main>
      </div>
      </LinkContext.Provider>
    </LazyMotion>
    </MotionConfig>
  );
}
