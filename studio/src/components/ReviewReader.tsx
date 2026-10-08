import { Fragment, useMemo, useState } from 'react';
import { toast } from 'sonner';
import { submitReview, type BotStatus, type PostedInfo, type ReviewContent, type ReviewItem } from '../lib/api';
import { usePersistentState } from '../lib/layout';
import { LinkContext } from '../lib/links';
import { useRerun } from '../lib/useRerun';
import { useReviewVersions } from '../lib/useReviewVersions';
import { useSectionState } from '../lib/useSectionState';
import { squash } from '../lib/reviewComments';
import { PostContext } from '../lib/reviewContexts';
import { extractMeta, rankOf, SUPPORTING_RANK, splitSections } from '../lib/reviewSections';
import { CollapsibleCard } from './CollapsibleCard';
import { ConfirmSubmit } from './ConfirmSubmit';
import { Discussion } from './Discussion';
import { FindingsPanel } from './FindingsPanel';
import { FixesPanel } from './FixesPanel';
import { GlanceBody, Md } from './ReviewMarkdown';
import { ReaderHeader } from './ReaderHeader';
import { ReaderNotices } from './ReaderNotices';
import { ReaderSidePanel } from './ReaderSidePanel';

export function ReviewReader({ item, review: currentReview, projectUrl, jiraBaseUrl, allowPosting, allowPush, live, posted, reload }: { item: ReviewItem | undefined; review: ReviewContent | null; projectUrl: string | null; jiraBaseUrl: string | null; allowPosting: boolean; allowPush: boolean; live: BotStatus['current']; posted: Record<string, PostedInfo>; reload: () => void }) {
  const [submitting, setSubmitting] = useState(false);
  const { versions, versionId, setVersionId, oldReview } = useReviewVersions(item?.slug, item?.reviewedAt);
  const viewingOld = versionId !== null;
  const content = viewingOld ? oldReview : currentReview;
  const markdown = content?.markdown ?? null;
  const shape = content?.shape ?? null;
  const { rerunning, rerun } = useRerun(item, live);
  const draftCount = item ? Object.entries(posted).filter(([k, p]) => k.startsWith(`${item.slug}:`) && p.state === 'draft').length : 0;
  const locked = rerunning || Boolean(live) || viewingOld;
  const postCtx = useMemo(() => ({ allowPosting, slug: item?.slug ?? null, iid: item?.tracked ? item.iid : null, posted, reload, locked, findings: shape?.findings ?? [] }), [allowPosting, item?.slug, item?.tracked, item?.iid, posted, reload, locked, shape]);
  const linkCtx = useMemo(() => ({ projectUrl, branch: item?.branch ?? null, mrWebUrl: item?.webUrl ?? null }), [projectUrl, item?.branch, item?.webUrl]);
  const meta = useMemo(() => extractMeta(markdown ?? ''), [markdown]);
  // Findings the person can't reach from the report's own text (no comment card for them there).
  const loose = useMemo(() => {
    const text = squash(markdown ?? '');
    return (shape?.findings ?? []).filter((f) => !f.comment || !text.includes(squash(f.comment)));
  }, [markdown, shape]);
  const { intro, sections } = useMemo(() => splitSections(meta.markdown), [meta]);
  const ordered = useMemo(
    () => sections.map((s, i) => ({ s, i })).sort((a, b) => rankOf(a.s.title) - rankOf(b.s.title) || a.i - b.i).map((x) => x.s),
    [sections],
  );
  const firstSupporting = ordered.find((s) => rankOf(s.title) === SUPPORTING_RANK && ordered.some((o) => rankOf(o.title) < SUPPORTING_RANK))?.id;
  const { overrides, setOverrides, isOpen, allOpen, setAll, jump } = useSectionState(sections);
  const [semantic, setSemantic] = usePersistentState('mr-review-viewer:semantic-on', true);
  const [panelOpen, setPanelOpen] = usePersistentState('mr-review-viewer:panel-open', true);

  return (
    <LinkContext.Provider value={linkCtx}>
    <PostContext.Provider value={postCtx}>
    <div className="px-6 py-6">
      <ReaderHeader
        item={item}
        showSubmit={allowPosting && Boolean(item?.tracked) && (draftCount > 0 || item?.kind === 'review')}
        draftCount={draftCount}
        onSubmit={() => setSubmitting(true)}
        versions={versions}
        versionId={versionId}
        onVersion={setVersionId}
        locked={locked}
        onRerun={rerun}
        semantic={semantic}
        onSemantic={() => setSemantic((v) => !v)}
        panelOpen={panelOpen}
        onPanel={() => setPanelOpen((v) => !v)}
      />

      {markdown === null ? (
        <p className="text-fg-muted">Loading…</p>
      ) : (
        <div className="flex gap-8">
          <article className="mx-auto w-full min-w-0 max-w-[80ch] space-y-3">
            <ReaderNotices viewingOld={viewingOld} onBackToLatest={() => setVersionId(null)} shape={shape} />
            {intro.trim() && <Md semantic={semantic}>{intro}</Md>}
            {ordered.map((s) => (
              <Fragment key={s.id}>
              {s.id === firstSupporting && <p className="px-1 pt-3 text-xs font-medium uppercase tracking-wide text-fg-subtle">Supporting detail</p>}
              <CollapsibleCard id={s.id} title={s.title} open={isOpen(s)} onOpenChange={(o) => setOverrides((prev) => ({ ...prev, [s.id]: o }))}>
                {/at a glance/i.test(s.title) ? <GlanceBody body={s.body} semantic={semantic} /> : <Md semantic={semantic}>{s.body}</Md>}
              </CollapsibleCard>
              </Fragment>
            ))}
            {item?.tracked && item.iid && !viewingOld && loose.length > 0 && (
              <CollapsibleCard id="findings" title={`Findings to comment on (${loose.length})`} open={overrides.findings ?? true} onOpenChange={(o) => setOverrides((prev) => ({ ...prev, findings: o }))}>
                <FindingsPanel findings={loose} slug={item.slug} iid={item.iid} allowPosting={allowPosting} locked={locked} posted={posted} reload={reload} />
              </CollapsibleCard>
            )}
            {item?.tracked && item.iid && item.kind === 'comments' && !viewingOld && (
              <CollapsibleCard id="fixes" title="Fixes to push" open={overrides.fixes ?? true} onOpenChange={(o) => setOverrides((prev) => ({ ...prev, fixes: o }))}>
                <FixesPanel slug={item.slug} iid={item.iid} allowPush={allowPush} locked={locked} refreshKey={item.reviewedAt} />
              </CollapsibleCard>
            )}
            {item?.tracked && item.kind === 'review' && !viewingOld && (
              <CollapsibleCard id="discussion" title="Discussion on GitLab" open={overrides.discussion ?? true} onOpenChange={(o) => setOverrides((prev) => ({ ...prev, discussion: o }))}>
                <Discussion slug={item.slug} canReply={allowPosting && !locked} refreshKey={`${item.reviewedAt}:${draftCount}`} reload={reload} />
              </CollapsibleCard>
            )}
          </article>

          <ReaderSidePanel item={item} live={live} open={panelOpen} projectUrl={projectUrl} jiraBaseUrl={jiraBaseUrl} ticket={meta.ticket} sections={ordered} allOpen={allOpen} onToggleAll={() => setAll(!allOpen)} onJump={jump} />
        </div>
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
          await submitReview(item.slug, summary.trim() || undefined, action);
          setSubmitting(false);
          reload();
          const done = { comment: 'submitted', approve: 'approved', request_changes: 'submitted with changes requested' }[action];
          toast.success(`Review of !${item.iid} ${done}`, item.webUrl ? { action: { label: 'Open', onClick: () => window.open(item.webUrl!, '_blank', 'noopener') } } : undefined);
        }}
      />
    )}
    </PostContext.Provider>
    </LinkContext.Provider>
  );
}
