import { useContext, useMemo, useState } from 'react';
import { toast } from '../lib/toast';
import { submitReview, type BotStatus, type PostedInfo, type ReviewAction, type ReviewContent, type ReviewItem } from '../lib/api';
import { LinkContext } from '../lib/links';
import { cn } from '../lib/utils';
import { useRerun } from '../lib/useRerun';
import { trackSend, useSending } from '../lib/sending';
import { useRecap, recapRefreshKey } from '../lib/recapApi';
import { useReviewVersions } from '../lib/useReviewVersions';
import { useSectionState } from '../lib/useSectionState';
import { useThreads } from '../lib/useThreads';
import { useFixes } from '../lib/useFixes';
import { useRuns } from '../lib/useRuns';
import { runToFlag } from '../lib/runs';
import { reviewerThreads } from '../lib/replies';
import { PostContext, RecapMarksContext } from '../lib/reviewContexts';
import { marksOf } from '../lib/recapMarks';
import { useReportParts } from '../lib/useReportParts';
import { CollapsibleCard } from './CollapsibleCard';
import { ConfirmSubmit } from './ConfirmSubmit';
import { FindingsPanel } from './FindingsPanel';
import { ReaderHeader } from './ReaderHeader';
import { ReportSections } from './ReportSections';
import { ReaderNotices } from './ReaderNotices';
import { ReviewOverview } from './ReviewOverview';
import { ReviewRisk } from './ReviewRisk';
import { ReplyBoard } from './ReplyBoard';
import { RecapNotice } from './RecapNotice';
import { RecapPanel } from './RecapPanel';
import { ReviewTour } from './ReviewTour';
import { CleanReview } from './CleanReview';
import { RunPanel } from './RunPanel';
import { TourSkeleton } from './ReviewSkeleton';
import { Button } from './ui/Button';
import { postedFor } from '../lib/postedKey';

export function ReviewReader({ item, review: currentReview, reviewError, onRetry, projectUrl, allowPosting, showFullDiff, live, finding = null, version = null, posted, reload }: { showFullDiff: boolean; finding?: string | null; version?: string | null; item: ReviewItem | undefined; review: ReviewContent | null; reviewError: string | null; onRetry: () => void; projectUrl: string | null; allowPosting: boolean; live: BotStatus['current']; posted: Record<string, PostedInfo>; reload: () => void }) {
  const [submitting, setSubmitting] = useState(false);
  const { versionId, setVersionId, oldReview, hasEarlier, historyKnown } = useReviewVersions(item?.slug, item?.reviewedAt, version);
  // What changed since the baseline: only for a tracked MR, and not while reading an older version.
  const { recap, loading: recapLoading, error: recapError, retry: retryRecap } = useRecap(item?.tracked ? item.slug : null, item ? recapRefreshKey(item) : '');
  const marks = useMemo(() => marksOf(recap), [recap]);
  const viewingOld = versionId !== null;
  const content = viewingOld ? oldReview : currentReview;
  const markdown = historyKnown ? content?.markdown ?? null : null;
  const shape = content?.shape ?? null;
  const { rerunning, rerun } = useRerun(item, live);
  // What the bot is doing on this MR, while it does it: a passing activity log, gone once the run
  // ends. Only a run that failed stays, for what to do about it.
  // A held MR (GLOSSARY: Hold) has no run coming: it says why instead of a run panel.
  const held = item?.awaiting === 'held';
  const awaiting = item?.awaiting === 'held' ? null : item?.awaiting ?? null;
  const runs = useRuns(item?.tracked ? item.slug : null);
  const flagged = runToFlag(runs, item?.reviewedAt);
  const runPanel = item && (awaiting || live || flagged)
    ? <RunPanel key={item.slug} slug={item.slug} awaiting={awaiting} failure={item.failure ?? null} collapsible={!awaiting && !live} defaultOpen={Boolean(awaiting || live)} liveRunId={live?.runId ?? null} />
    : null;
  const draftCount = item ? postedFor(posted, item.slug).filter((p) => p.state === 'draft').length : 0;
  // Sent in the background: the modal is already closed and the reader moves on. One toast follows
  // the request from "sending" to its outcome. A failure leaves the drafts on GitLab, to submit again.
  const send = (it: ReviewItem, summary: string | undefined, action: ReviewAction) => {
    const id = `submit-${it.slug}`;
    const what = it.kind === 'comments' ? `replies on !${it.iid}` : `review of !${it.iid}`;
    // The same id as a failure before it: its description, action and lasting duration are reset.
    toast.loading(`Sending the ${what}…`, { id, description: undefined, action: undefined, duration: undefined, closeButton: false });
    trackSend(it.slug, () => submitReview(it.slug, summary, action)).then(() => {
      reload();
      const done = { comment: 'submitted', approve: 'approved', request_changes: 'submitted with changes requested' }[action];
      toast.sent(it.kind === 'comments' ? `Replies on !${it.iid} sent` : `Review of !${it.iid} ${done}`, { id, action: it.webUrl ? { label: 'Open', onClick: () => window.open(it.webUrl!, '_blank', 'noopener') } : undefined });
    }, (e: Error) => {
      reload();
      // Only the approval can be retried: the comments and the summary are already out. After any
      // other failure the summary may be on GitLab as a draft, so sending it again could post it twice.
      const approvalOnly = action === 'approve' && /^Comments published/.test(e.message);
      toast.error(`Could not send the ${what}`, { id, description: e.message, duration: Infinity, closeButton: true, ...(approvalOnly && { action: { label: 'Approve again', onClick: () => send(it, undefined, action) } }) });
    });
  };
  const inFlight = useSending(item?.slug);
  // A comment still on its way would land after the submit, as a new pending one: wait for it.
  const sending = item ? postedFor(posted, item.slug).some((p) => p.pending) : false;
  const locked = rerunning || Boolean(live) || viewingOld;
  // My own MR: I answer the reviewers and push the triage's fixes, I do not review it.
  const author = item?.kind === 'comments';
  // My own work, reviewed for me: read and copy, never posted (the server refuses it too).
  const mayPost = allowPosting && item?.kind !== 'own';
  const onLatest = Boolean(item?.tracked && item.iid && !viewingOld);
  const fixes = useFixes(author && onLatest && item ? item.slug : null, item?.reviewedAt);
  const allThreads = useThreads(author && onLatest && item ? item.slug : null, item?.reviewedAt, 'all');
  const openThreads = useMemo(() => reviewerThreads(allThreads), [allThreads]);
  const postCtx = useMemo(() => ({ allowPosting: mayPost, slug: item?.slug ?? null, iid: item?.tracked ? item.iid : null, posted, reload, locked, findings: shape?.findings ?? [] }), [mayPost, item?.slug, item?.tracked, item?.iid, posted, reload, locked, shape]);
  const { tickets } = useContext(LinkContext);
  const linkCtx = useMemo(() => ({ projectUrl, branch: item?.branch ?? null, mrWebUrl: item?.webUrl ?? null, tickets }), [projectUrl, item?.branch, item?.webUrl, tickets]);
  const { stops, loose, looseFocus, intro, sections, ordered, firstSupporting } = useReportParts(markdown, shape, finding, item?.title);
  const threads = useThreads(!author && item?.tracked && item.iid && !viewingOld && loose.length ? item.slug : null, item?.reviewedAt);
  const { overrides, setOverrides, isOpen } = useSectionState(sections);
  // My own MR is not reviewed but answered: the reviewer threads and the fixes take the place of a tour.
  const answering = Boolean(author && onLatest && item?.iid);
  // A review with a tour is read through its tour; the written report only stands in for one without.
  const hasTour = !author && stops.length > 0;
  // Structured, with chapters, and nothing in any of them: the header says it all (CleanReview).
  const clean = !author && !answering && !hasTour && Boolean(shape?.overview) && (shape?.tour?.length ?? 0) > 0 && loose.length === 0 && (shape?.findings.length ?? 0) === 0;

  return (
    <LinkContext.Provider value={linkCtx}>
    <PostContext.Provider value={postCtx}>
    <RecapMarksContext.Provider value={marks}>
    <div className="px-6 py-6">
      {/* A review with a tour fits the window: header and overview on top, the tour taking the rest
          with each pane scrolling inside it. What comes after is below, on the page. */}
      <div className={cn((hasTour || answering || markdown === null) && 'lg:flex lg:h-[calc(100vh-var(--chrome-h)-3rem)] lg:flex-col')}>
      <ReaderHeader
        item={item}
        risk={shape?.risk ?? null}
        criticalPaths={shape?.criticalPaths ?? []}
        showSubmit={(mayPost || author) && Boolean(item?.tracked) && !awaiting && !held && (draftCount > 0 || item?.kind === 'review')}
        draftCount={draftCount}
        sending={sending}
        submitting={inFlight}
        reviewing={rerunning || Boolean(live)}
        onSubmit={() => setSubmitting(true)}
        locked={locked}
        onRerun={rerun}
      />
      <ReaderNotices viewingOld={viewingOld} onBackToLatest={() => setVersionId(null)} />
      {runPanel}
      {held && <p role="status" className="rounded-lg border border-line p-4 text-sm text-fg-muted">Not reviewed by this poll: {item?.hold}</p>}
      {markdown === null && !awaiting && !held && (reviewError && !viewingOld ? (
        <div role="alert" className="flex flex-wrap items-center gap-3 rounded-lg border border-line p-4 text-sm text-fg-muted">
          <span>This review could not be loaded ({reviewError}).</span>
          <Button size="sm" onClick={onRetry}>Try again</Button>
        </div>
      ) : <TourSkeleton />)}
      {markdown !== null && shape?.overview && <ReviewOverview overview={shape.overview} />}
      {markdown !== null && <ReviewRisk risk={shape?.risk ?? null} />}
      {markdown !== null && !viewingOld && (recap
        // Keyed by review: each one starts open, whatever the last one was left at.
        ? <RecapPanel key={recap.slug} recap={recap} />
        // Room is kept only where a recap is likely: an earlier report exists, or I submitted on it.
        : <RecapNotice loading={recapLoading && Boolean(hasEarlier || item?.myState?.reviewed)} error={recapError} retry={retryRecap} />)}
      {markdown !== null && hasTour && (
          <ReviewTour showFullDiff={showFullDiff} target={finding} stops={stops} findings={shape!.findings} diff={item?.tracked && item.iid ? { slug: item.slug, version: versionId, key: item.reviewedAt } : null} post={item?.tracked && item.iid && !viewingOld ? { slug: item.slug, iid: item.iid, allowPosting: mayPost, locked, posted, reload } : null} onReport={setVersionId} />
      )}
      {markdown !== null && answering && item?.iid && (
        <ReplyBoard slug={item.slug} iid={item.iid} threads={allThreads} open={openThreads} replies={shape?.replies ?? []} posted={posted} fixes={fixes} locked={locked} reload={reload} refreshKey={item.reviewedAt} showFullDiff={showFullDiff} onReport={setVersionId} />
      )}
      </div>

      {markdown !== null && clean && <CleanReview chapters={shape?.tour ?? []} />}
      {markdown !== null && !clean && (
        <article className="mx-auto w-full min-w-0 max-w-[80ch] space-y-3">
            {!hasTour && !answering && <ReportSections intro={intro} sections={ordered} firstSupporting={firstSupporting} isOpen={isOpen} setOverrides={setOverrides} />}
            {!author && item?.tracked && item.iid && !viewingOld && loose.length > 0 && (
              <CollapsibleCard id="findings" title={`${hasTour ? 'Other findings' : 'Findings to comment on'} (${loose.length})`} open={looseFocus ? true : overrides.findings ?? true} onOpenChange={(o) => setOverrides((prev) => ({ ...prev, findings: o }))}>
                <FindingsPanel findings={loose} focus={looseFocus} threads={threads} slug={item.slug} iid={item.iid} allowPosting={mayPost} locked={locked} posted={posted} reload={reload} />
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
        onConfirm={(summary, action) => {
          setSubmitting(false);
          send(item, summary.trim() || undefined, action);
        }}
      />
    )}
    </RecapMarksContext.Provider>
    </PostContext.Provider>
    </LinkContext.Provider>
  );
}
