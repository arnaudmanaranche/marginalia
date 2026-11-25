import { Suspense, lazy, type ReactNode } from 'react';
import type { ReviewItem, ReviewsPayload } from '../lib/api';
import { ACTIVITY_ROUTE, APPROVALS_ROUTE, JOBS_ROUTE, QUEUE_ROUTE, SETTINGS_ROUTE, contextKeyOf, isReviewRoute } from '../lib/hashRoute';
import { liveRunOf } from '../lib/liveRun';
import { useReview } from '../lib/useReviews';
import { ApprovalsView } from './ApprovalsPage';
import { ActivityView, QueueScreen } from './Pages';
import { ProjectView } from './ProjectPage';
import { ReviewMissing, ReviewSkeleton } from './ReviewSkeleton';
import { SettingsPage } from './SettingsPage';
import { StackBoard } from './StackBoard';

// Not needed on Home, and the heaviest part of the bundle (markdown, highlighting).
export const loadReader = () => import('./ReviewReader');
const ReviewReader = lazy(() => loadReader().then((m) => ({ default: m.ReviewReader })));

interface ScreenProps {
  route: { slug: string | null; finding: string | null; path: string | null; version: string | null };
  data: ReviewsPayload | null;
  items: ReviewItem[];
  posted: ReviewsPayload['posted'];
  reload: () => void;
  isPosted: (i: ReviewItem) => boolean;
  onOpen: (route: string | null) => void;
  // Home: what no route points at.
  home: ReactNode;
}

function ReviewScreen({ route, data, items, posted, reload, isPosted, onOpen }: Omit<ScreenProps, 'home'>) {
  const current = items.find((i) => i.slug === route.slug);
  const stack = current?.stackId ? data?.stacks.find((s) => s.id === current.stackId) : undefined;
  const { content: review, error: reviewError, retry } = useReview(route.slug, current?.reviewedAt);
  return (
    <>
      {stack && current && <StackBoard stack={stack} items={items} current={current} isPosted={isPosted} onSelect={onOpen} />}
      {!data ? <ReviewSkeleton /> : !current ? <ReviewMissing /> : (
        <Suspense fallback={<ReviewSkeleton />}>
          <ReviewReader item={current} review={review} reviewError={reviewError} onRetry={retry} projectUrl={data.projects?.find((p) => p.key === current.project)?.url ?? data.projectUrl ?? null} allowPosting={data.allowPosting ?? false} showFullDiff={data.settings.showFullDiff ?? true} live={liveRunOf(data.status, current)} finding={route.finding} version={route.version} posted={posted} reload={reload} />
        </Suspense>
      )}
    </>
  );
}

// The screen the hash points at.
export function Screen({ home, ...props }: ScreenProps) {
  const { slug, path } = props.route;
  const projectKey = contextKeyOf(slug);
  if (slug === SETTINGS_ROUTE) return <SettingsPage settings={props.data?.settings ?? null} defaults={props.data?.settingsDefaults ?? null} projects={props.data?.projects ?? []} nextPollAt={props.data?.status?.nextPollAt ?? null} />;
  if (slug === APPROVALS_ROUTE) return <ApprovalsView onOpen={props.onOpen} />;
  if (slug === ACTIVITY_ROUTE || slug === JOBS_ROUTE) return <ActivityView items={props.items} onOpen={props.onOpen} />;
  if (slug === QUEUE_ROUTE) return <QueueScreen nextPollAt={props.data?.status?.nextPollAt ?? null} onOpen={props.onOpen} />;
  if (projectKey) return <ProjectView key={slug} projectKey={projectKey} focusPath={path} />;
  return isReviewRoute(slug) ? <ReviewScreen {...props} /> : home;
}
