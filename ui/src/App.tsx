import { Suspense, lazy, useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { LazyMotion, MotionConfig } from 'motion/react';
import { Toaster } from 'sonner';
import { toast } from './lib/toast';
import { loadSeen, saveSeen, type ReviewItem } from './lib/api';
import { useReview, useReviews } from './lib/useReviews';
import { useLiveEvents } from './lib/useLiveEvents';
import { useArrivals } from './lib/arrivals';
import { useSoundCues } from './lib/useSoundCues';
import { ALL_PROJECTS, activeFilter, filterByProject, filterOptions, hasSeveralProjects } from './lib/projects';
import { useMergedPosted } from './lib/pendingPosts';
import { useNeedsYou } from './lib/useNeedsYou';
import { usePersistentState, useOpenTabs } from './lib/layout';
import { StatusBar } from './components/StatusBar';
import { TabStrip, type BotState } from './components/TabStrip';
import { HomeFeed } from './components/HomeFeed';
import { ProjectFilter } from './components/ProjectFilter';
// Not needed on Home, and the heaviest part of the bundle (markdown, highlighting).
const loadReader = () => import('./components/ReviewReader');
const ReviewReader = lazy(() => loadReader().then((m) => ({ default: m.ReviewReader })));
import { CommandPalette } from './components/CommandPalette';
import { SettingsPage } from './components/SettingsPage';
import { ApprovalsView } from './components/ApprovalsPage';
import { APPROVALS_ROUTE, useApprovals } from './lib/approvalsApi';
import { liveRunOf } from './lib/liveRun';
import { useTheme } from './lib/theme';
import { ProjectView } from './components/ProjectPage';
import { contextKeyOf } from './lib/contextApi';
import { StackBoard } from './components/StackBoard';
import { ReviewMissing, ReviewSkeleton } from './components/ReviewSkeleton';
import { SETTINGS_ROUTE, parseHash } from './lib/hashRoute';
import { LinkContext } from './lib/links';
import { ticketLinks } from './lib/tickets';

const EMPTY_POSTED = {};
// `#/settings` is the settings page, not a review.
// `#/jobs` was the jobs page; Home is the feed now (ADR 0007), so it lands there.
const JOBS_ROUTE = 'jobs';
// The animation features load after the first paint; until then `m` components just render.
const loadMotionFeatures = () => import('./lib/motionFeatures').then((mod) => mod.default);

function useHashRoute() {
  const [route, setRoute] = useState(() => parseHash(location.hash));
  useEffect(() => {
    const on = () => setRoute(parseHash(location.hash));
    window.addEventListener('hashchange', on);
    return () => window.removeEventListener('hashchange', on);
  }, []);
  return route;
}

// Which reviews were read, at which version. Opening a review marks it as read; saved here,
// not inside a state updater.
function useSeen(current: ReviewItem | undefined) {
  const [seen, setSeen] = useState(loadSeen);
  useEffect(() => {
    if (!current || seen[current.slug] === current.reviewedAt) return;
    const next = { ...seen, [current.slug]: current.reviewedAt };
    saveSeen(next);
    setSeen(next);
  }, [current, seen]);
  const isUnread = useCallback((i: ReviewItem) => seen[i.slug] !== i.reviewedAt, [seen]);
  return { isUnread };
}

// Close the active review tab like a browser tab. ⌘W is reserved by the browser (a page never
// receives it), so the working shortcuts are Ctrl+W, ⌥W and ⌘⌥W; plain ⌘W is handled too in case
// it is ever delivered. The "W" is the character typed, not the physical position, so it also works
// on AZERTY (where that key sits where QWERTY has Z). Ignored while typing.
function useCloseTabShortcut(slug: string | null, palette: boolean, close: (slug: string) => void) {
  // Physical key that types "w" on the current layout (AZERTY: KeyZ), used
  // for Option combos where e.key is a symbol. Chromium only; else e.key alone.
  const wCode = useRef<string | null>(null);
  useEffect(() => {
    const kb = (navigator as unknown as { keyboard?: { getLayoutMap?: () => Promise<Map<string, string>> } }).keyboard;
    kb?.getLayoutMap?.().then((map) => {
      for (const [code, ch] of map) if (ch === 'w') wCode.current = code;
    }).catch(() => {});
  }, []);
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      const isW = e.key.toLowerCase() === 'w' || e.key === '∑' || (wCode.current !== null && e.code === wCode.current);
      if (!isW || e.shiftKey || !(e.ctrlKey || e.metaKey || e.altKey) || !slug) return;
      const el = e.target as HTMLElement | null;
      if (el && (el.isContentEditable || /^(INPUT|TEXTAREA|SELECT)$/.test(el.tagName))) return;
      if (palette || document.querySelector('[role=dialog]')) return;
      e.preventDefault();
      close(slug);
    };
    document.addEventListener('keydown', onKey);
    return () => document.removeEventListener('keydown', onKey);
  });
}

export function App() {
  useLiveEvents();
  const { data, error, reload } = useReviews();
  const [projectFilter, setProjectFilter] = usePersistentState('mr-review-viewer:project-filter', ALL_PROJECTS);
  const posted = useMergedPosted(data?.posted ?? EMPTY_POSTED);
  const { slug, finding, path: focusPath } = useHashRoute();
  const [palette, setPalette] = useState(false);

  // One persistent toast while the API is unreachable, dismissed once it's back.
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
  // Live bot state per review, from status.json (mr.reviewPath -> slug).
  const botBySlug = useMemo(() => {
    const m = new Map<string, BotState>();
    for (const mr of data?.status?.mrs ?? []) {
      const file = mr.reviewPath?.split('/').pop();
      if (file) m.set(`${mr.project}/${file.replace(/\.md$/, '')}`, mr.held === 'budget' ? 'held' : mr.status as BotState);
    }
    return m;
  }, [data]);
  // The bot is reviewing it right now: its row is disabled until the new report is written.
  const isReviewing = (i: ReviewItem) => botBySlug.get(i.slug) === 'reviewing' || liveRunOf(data?.status, i) !== null;
  const isHeld = (i: ReviewItem) => botBySlug.get(i.slug) === 'held';
  const isPosted = (i: ReviewItem) => Object.keys(posted).some((k) => k.startsWith(`${i.slug}:`));
  const current = items.find((i) => i.slug === slug);
  const stack = current?.stackId ? data?.stacks.find((s) => s.id === current.stackId) : undefined;
  const { content: review, error: reviewError, retry: retryReview } = useReview(slug === SETTINGS_ROUTE || slug === JOBS_ROUTE || slug === APPROVALS_ROUTE || contextKeyOf(slug) ? null : slug, current?.reviewedAt);

  const { isUnread } = useSeen(current);
  const projects = data?.projects;
  const several = hasSeveralProjects(projects);
  const approvalCount = useApprovals().data?.proposals.length ?? 0;
  const filter = activeFilter(projectFilter, projects);
  const shown = useMemo(() => filterByProject(items, filter, projects), [items, filter, projects]);
  // The Home tab counts what waits on you in every project, whatever the filter hides.
  const waitingAll = useNeedsYou(items).count;

  const [theme] = useTheme();
  const go = (s: string | null) => {
    location.hash = s ? `#/${s}` : '';
    window.scrollTo({ top: 0 });
  };
  const close = (s: string) => {
    const next = closeTab(s);
    if (s === slug) go(next);
  };

  useCloseTabShortcut(slug, palette, close);
  // An old `#/jobs` link lands on Home, which is the feed now.
  useEffect(() => { if (slug === JOBS_ROUTE) go(null); }, [slug]);

  return (
    // reducedMotion="user": no layout animation if the OS asks for less motion.
    <MotionConfig reducedMotion="user">
    <LazyMotion features={loadMotionFeatures} strict>
      <Toaster position="bottom-right" theme={theme} richColors />
      <header className="sticky top-0 z-40 bg-canvas">
        <StatusBar status={data?.status ?? null} connection={data ? 'ok' : error ? 'unreachable' : 'connecting'} settingsActive={slug === SETTINGS_ROUTE} approvalsActive={slug === APPROVALS_ROUTE} approvals={approvalCount} onApprovals={() => go(APPROVALS_ROUTE)} onOpenPalette={() => setPalette(true)} onHome={() => go(null)} onSettings={() => go(SETTINGS_ROUTE)} />
        <TabStrip
          tabs={tabItems}
          activeSlug={slug}
          botBySlug={botBySlug}
          isUnread={isUnread}
          isPosted={isPosted}
          homeUnread={waitingAll}
          onSelect={go}
          onClose={close}
        />
      </header>
      <CommandPalette open={palette} setOpen={setPalette} items={items} onSelect={go} />

      <LinkContext.Provider value={links}>
      <div className="flex">
        <main className="min-w-0 flex-1">
      {slug === SETTINGS_ROUTE ? (
        <SettingsPage settings={data?.settings ?? null} defaults={data?.settingsDefaults ?? null} projects={projects ?? []} nextPollAt={data?.status?.nextPollAt ?? null} />
      ) : slug === APPROVALS_ROUTE ? (
        <ApprovalsView onOpen={go} />
      ) : contextKeyOf(slug) ? (
        <ProjectView key={slug} projectKey={contextKeyOf(slug)!} focusPath={focusPath} />
      ) : slug ? (
        <>
        {stack && current && <StackBoard stack={stack} items={items} current={current} isPosted={isPosted} onSelect={go} />}
        {!data ? <ReviewSkeleton /> : !current ? <ReviewMissing /> : (
        <Suspense fallback={<ReviewSkeleton />}>
        <ReviewReader item={current} review={review} reviewError={reviewError} onRetry={retryReview} projectUrl={data?.projects?.find((p) => p.key === current?.project)?.url ?? data?.projectUrl ?? null} allowPosting={data?.allowPosting ?? false} showFullDiff={data?.settings.showFullDiff ?? true} live={current ? liveRunOf(data?.status, current) : null} finding={finding} posted={posted} reload={reload} />
        </Suspense>
        )}
        </>
      ) : (
        <HomeFeed
          loaded={Boolean(data)} items={shown} isUnread={isUnread} isReviewing={isReviewing} isHeld={isHeld} isNew={isNew} isChanged={isChanged} showProject={several} onOpen={go}
          filter={several ? <ProjectFilter options={filterOptions(projects)} value={filter} onChange={setProjectFilter} /> : undefined}
        />
      )}
        </main>
      </div>
      </LinkContext.Provider>
    </LazyMotion>
    </MotionConfig>
  );
}
