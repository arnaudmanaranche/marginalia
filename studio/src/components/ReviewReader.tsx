import { useMemo, useState } from 'react';
import { toast } from 'sonner';
import { useMutation } from '@tanstack/react-query';
import { submitReview, type BotStatus, type PostedInfo, type ReviewAction, type ReviewContent, type ReviewItem } from '../lib/api';
import { LinkContext } from '../lib/links';
import { cn } from '../lib/utils';
import { useRerun } from '../lib/useRerun';
import { useReviewVersions } from '../lib/useReviewVersions';
import { useSectionState } from '../lib/useSectionState';
import { useThreads } from '../lib/useThreads';
import { useFixes } from '../lib/useFixes';
import { useRuns } from '../lib/useRuns';
import { runToFlag } from '../lib/runs';
import { reviewerThreads } from '../lib/replies';
import { squash } from '../lib/reviewComments';
import { PostContext } from '../lib/reviewContexts';
import { extractMeta, rankOf, SUPPORTING_RANK, splitSections } from '../lib/reviewSections';
import { CollapsibleCard } from './CollapsibleCard';
import { ConfirmSubmit } from './ConfirmSubmit';
import { FindingsPanel } from './FindingsPanel';
import { ReaderHeader } from './ReaderHeader';
import { ReportSections } from './ReportSections';
import { ReaderNotices } from './ReaderNotices';
import { ReviewOverview } from './ReviewOverview';
import { ReplyBoard } from './ReplyBoard';
import { ReportDelta } from './ReportDelta';
import { ReviewTour } from './ReviewTour';
import { RunPanel } from './RunPanel';
import { TourSkeleton } from './ReviewSkeleton';
import { Button } from './ui/Button';

export function ReviewReader({ item, review: currentReview, reviewError, onRetry, projectUrl, allowPosting, showFullDiff, live, posted, reload }: { showFullDiff: boolean; item: ReviewItem | undefined; review: ReviewContent | null; reviewError: string | null; onRetry: () => void; projectUrl: string | null; allowPosting: boolean; live: BotStatus['current']; posted: Record<string, PostedInfo>; reload: () => void }) {
  const [submitting, setSubmitting] = useState(false);
  const { versionId, setVersionId, oldReview, previous } = useReviewVersions(item?.slug, item?.reviewedAt);
  const viewingOld = versionId !== null;
  const content = viewingOld ? oldReview : currentReview;
  const markdown = content?.markdown ?? null;
  const shape = content?.shape ?? null;
  const { rerunning, rerun } = useRerun(item, live);
  // The bot's runs on this MR: followed live, and shown when the last one failed after this report.
  const awaiting = item?.awaiting ?? null;
  const runs = useRuns(item?.tracked ? item.slug : null);
  const flagged = runToFlag(runs, item?.reviewedAt);
  const [showRuns, setShowRuns] = useState(false);
  const runPanel = item && (awaiting || live || flagged || showRuns)
    ? <RunPanel key={item.slug} slug={item.slug} awaiting={awaiting} failure={item.failure ?? null} collapsible={!awaiting} defaultOpen={Boolean(awaiting) || showRuns} liveRunId={live?.runId ?? null} />
    : null;
  const submit = useMutation({ mutationFn: (v: { slug: string; summary?: string; action: ReviewAction }) => submitReview(v.slug, v.summary, v.action) });
  const draftCount = item ? Object.entries(posted).filter(([k, p]) => k.startsWith(`${item.slug}:`) && p.state === 'draft').length : 0;
  // A comment still on its way would land after the submit, as a new pending one: wait for it.
  const sending = item ? Object.entries(posted).some(([k, p]) => k.startsWith(`${item.slug}:`) && p.pending) : false;
  const locked = rerunning || Boolean(live) || viewingOld;
  // My own MR: I answer the reviewers and push the triage's fixes, I do not review it.
  const author = item?.kind === 'comments';
  const onLatest = Boolean(item?.tracked && item.iid && !viewingOld);
  const fixes = useFixes(author && onLatest && item ? item.slug : null, item?.reviewedAt);
  const allThreads = useThreads(author && onLatest && item ? item.slug : null, item?.reviewedAt, 'all');
  const openThreads = useMemo(() => reviewerThreads(allThreads), [allThreads]);
  const postCtx = useMemo(() => ({ allowPosting, slug: item?.slug ?? null, iid: item?.tracked ? item.iid : null, posted, reload, locked, findings: shape?.findings ?? [] }), [allowPosting, item?.slug, item?.tracked, item?.iid, posted, reload, locked, shape]);
  const linkCtx = useMemo(() => ({ projectUrl, branch: item?.branch ?? null, mrWebUrl: item?.webUrl ?? null }), [projectUrl, item?.branch, item?.webUrl]);
  const meta = useMemo(() => extractMeta(markdown ?? ''), [markdown]);
  // Findings the person can't reach otherwise: with a tour, the ones no chapter holds; without one,
  // those with no comment card in the report's own text.
  const loose = useMemo(() => {
    const findings = shape?.findings ?? [];
    const tour = shape?.tour ?? [];
    if (tour.length) return findings.filter((f) => !tour.some((s) => s.findingIds.includes(f.id)));
    const text = squash(markdown ?? '');
    return findings.filter((f) => !f.comment || !text.includes(squash(f.comment)));
  }, [markdown, shape]);
  // What others already raised folds those findings up; read only when there are some to post.
  const threads = useThreads(!author && item?.tracked && item.iid && !viewingOld && loose.length ? item.slug : null, item?.reviewedAt);
  const { intro, sections } = useMemo(() => splitSections(meta.markdown), [meta]);
  const ordered = useMemo(
    () => sections.map((s, i) => ({ s, i })).sort((a, b) => rankOf(a.s.title) - rankOf(b.s.title) || a.i - b.i).map((x) => x.s),
    [sections],
  );
  const firstSupporting = ordered.find((s) => rankOf(s.title) === SUPPORTING_RANK && ordered.some((o) => rankOf(o.title) < SUPPORTING_RANK))?.id;
  const { overrides, setOverrides, isOpen } = useSectionState(sections);
  // My own MR is not reviewed but answered: the reviewer threads and the fixes take the place of a tour.
  const answering = Boolean(author && onLatest && item?.iid);
  // A review with a tour is read through its tour; the written report only stands in for one without.
  const hasTour = !author && (shape?.tour?.length ?? 0) > 0;

  return (
    <LinkContext.Provider value={linkCtx}>
    <PostContext.Provider value={postCtx}>
    <div className="px-6 py-6">
      {/* A review with a tour fits the window: header and overview on top, the tour taking the rest
          with each pane scrolling inside it. What comes after is below, on the page. */}
      <div className={cn((hasTour || answering || markdown === null) && 'lg:flex lg:h-[calc(100vh-var(--chrome-h)-3rem)] lg:flex-col')}>
      <ReaderHeader
        item={item}
        risk={shape?.risk ?? null}
        showSubmit={(allowPosting || author) && Boolean(item?.tracked) && !awaiting && (draftCount > 0 || item?.kind === 'review')}
        draftCount={draftCount}
        sending={sending}
        reviewing={rerunning || Boolean(live)}
        onSubmit={() => setSubmitting(true)}
        locked={locked}
        onRerun={rerun}
        runsOpen={showRuns}
        onToggleRuns={item?.tracked && !awaiting ? () => setShowRuns((v) => !v) : undefined}
      />
      <ReaderNotices viewingOld={viewingOld} onBackToLatest={() => setVersionId(null)} />
      {runPanel}
      {markdown === null && !awaiting && (reviewError && !viewingOld ? (
        <div role="alert" className="flex flex-wrap items-center gap-3 rounded-lg border border-zinc-200 p-4 text-sm text-fg-muted dark:border-zinc-800">
          <span>This review could not be loaded ({reviewError}).</span>
          <Button size="sm" onClick={onRetry}>Try again</Button>
        </div>
      ) : <TourSkeleton />)}
      {markdown !== null && shape?.overview && <ReviewOverview overview={shape.overview} />}
      {markdown !== null && !viewingOld && previous && (
        <ReportDelta previous={previous.review.shape?.findings ?? []} at={previous.at} current={shape?.findings ?? []} onRead={() => setVersionId(previous.id)} />
      )}
      {markdown !== null && hasTour && (
          <ReviewTour showFullDiff={showFullDiff} stops={shape!.tour!} findings={shape!.findings} diff={item?.tracked && item.iid ? { slug: item.slug, version: versionId, key: item.reviewedAt } : null} post={item?.tracked && item.iid && !viewingOld ? { slug: item.slug, iid: item.iid, allowPosting, locked, posted, reload } : null} onReport={setVersionId} />
      )}
      {markdown !== null && answering && item?.iid && (
        <ReplyBoard slug={item.slug} iid={item.iid} threads={allThreads} open={openThreads} replies={shape?.replies ?? []} posted={posted} fixes={fixes} locked={locked} reload={reload} refreshKey={item.reviewedAt} showFullDiff={showFullDiff} onReport={setVersionId} />
      )}
      </div>

      {markdown !== null && (
        <article className="mx-auto w-full min-w-0 max-w-[80ch] space-y-3">
            {!hasTour && !answering && <ReportSections intro={intro} sections={ordered} firstSupporting={firstSupporting} isOpen={isOpen} setOverrides={setOverrides} />}
            {!author && item?.tracked && item.iid && !viewingOld && loose.length > 0 && (
              <CollapsibleCard id="findings" title={`${hasTour ? 'Other findings' : 'Findings to comment on'} (${loose.length})`} open={overrides.findings ?? true} onOpenChange={(o) => setOverrides((prev) => ({ ...prev, findings: o }))}>
                <FindingsPanel findings={loose} threads={threads} slug={item.slug} iid={item.iid} allowPosting={allowPosting} locked={locked} posted={posted} reload={reload} />
              </CollapsibleCard>
            )}
          </article>
      )}
    </div>
    {submitting && item?.iid && (
      <ConfirmSubmit
        slug={item.slug}
        reload={reload}
        iid={item.iid}
        count={draftCount}
        canVerdict={item.kind === 'review'}
        onCancel={() => setSubmitting(false)}
        onConfirm={async (summary, action) => {
          await submit.mutateAsync({ slug: item.slug, summary: summary.trim() || undefined, action });
          setSubmitting(false);
          reload();
          const done = { comment: 'submitted', approve: 'approved', request_changes: 'submitted with changes requested' }[action];
          toast.success(author ? `Replies on !${item.iid} sent` : `Review of !${item.iid} ${done}`, item.webUrl ? { action: { label: 'Open', onClick: () => window.open(item.webUrl!, '_blank', 'noopener') } } : undefined);
        }}
      />
    )}
    </PostContext.Provider>
    </LinkContext.Provider>
  );
}
