import { useEffect, useRef, useState } from 'react';
import { ChevronRight } from 'lucide-react';
import type { Finding, PostedInfo, Thread } from '../lib/api';
import { addToReview } from '../lib/pendingPosts';
import { raisedElsewhere, type RaisedBy } from '../lib/raisedElsewhere';
import { useFlash } from '../lib/useFlash';
import { cn } from '../lib/utils';
import { scrollInPane, type Focus } from '../lib/tourFocus';
import { Button } from './ui/Button';
import { ConfirmPost } from './ConfirmPost';
import { CommentArea, FindingHeader, RaisedCard, findingTarget } from './FindingParts';
import { NoteMarkdown } from './NoteMarkdown';
import { ClampedNote } from './ClampedNote';
import { bodyToShow } from '../lib/repeats';
import { PostedBadge } from './PostedBadge';
import { FindingProof } from './FindingProof';
import { SeverityDot } from './ds/Severity';
import { postedKey } from '../lib/postedKey';

interface PostProps {
  slug: string;
  iid: string | number;
  allowPosting: boolean;
  locked: boolean;
  posted: Record<string, PostedInfo>;
  reload: () => void;
}

// What the review's report doesn't let you comment on from its own text: findings the
// bot read from a structured file, or that came without a ready comment. Every finding
// can be commented on here, so the experience doesn't depend on how the skill wrote it.
// A finding someone else already raised in a thread is folded up (see raisedElsewhere()).
export function FindingsPanel({ findings, threads = [], compact = false, focus = null, onFocus, ...post }: { findings: Finding[]; threads?: Thread[]; compact?: boolean; focus?: Focus | null; onFocus?: (id: string) => void } & PostProps) {
  return (
    <ul className="space-y-3">
      {findings.map((f) => (
        <li key={f.id}><FindingCard finding={f} raised={raisedElsewhere(f, threads)} compact={compact} focus={focus} onFocus={onFocus} {...post} /></li>
      ))}
    </ul>
  );
}

function FindingCard({ finding, raised, compact = false, focus = null, onFocus, slug, iid, allowPosting, locked, posted, reload }: { finding: Finding; raised: RaisedBy | null; compact?: boolean; focus?: Focus | null; onFocus?: (id: string) => void } & PostProps) {
  const [unfolded, setUnfolded] = useState(false);
  const [text, setText] = useState(finding.comment ?? '');
  // Beside a diff a finding is one line (its title and an Add); its explanation and comment open on click.
  const [expanded, setExpanded] = useState(!compact);
  const [editing, setEditing] = useState(false);
  const [confirming, setConfirming] = useState(false);
  const rootRef = useRef<HTMLDivElement>(null);
  const [flashed, flash] = useFlash(1800);
  // Chosen in the diff: open it here, bring it into view, and light it up for a moment.
  useEffect(() => {
    if (focus?.source !== 'diff' || focus.id !== finding.id) return undefined;
    setExpanded(true);
    requestAnimationFrame(() => rootRef.current && scrollInPane(rootRef.current, 'nearest', 56));
    flash();
    return undefined;
  }, [focus, finding.id, flash]);
  const info = posted[postedKey(slug, finding.id)];
  // Once posted it is mine whatever the thread says: it shows as posted, not as folded.
  if (raised && !info && !unfolded) return <div ref={rootRef} tabIndex={-1} className={cn('rounded-lg transition-shadow focus:outline-none', flashed && 'ring-2 ring-blue-500')}><RaisedCard finding={finding} raised={raised} canPost={allowPosting} onFocus={onFocus} onUnfold={() => { setUnfolded(true); setExpanded(true); }} /></div>;
  const target = findingTarget(finding);
  // Once posted the comment is not shown, so the explanation is the only text left: it stays.
  const body = bodyToShow(info ? { ...finding, comment: null } : finding);
  const canPost = allowPosting && !info && !locked && text.trim().length > 0;
  const confirm = confirming && (
    <ConfirmPost
      iid={iid}
      text={text.trim()}
      target={target}
      fallbackRef={rootRef}
      onCancel={() => setConfirming(false)}
      onConfirm={() => {
        setConfirming(false);
        addToReview({ slug, iid, commentId: finding.id, body: text.trim(), target: target ?? undefined, reload });
      }}
    />
  );
  const comment = !info && (
    <CommentArea finding={finding} text={text} onText={setText} editing={editing} onEditing={() => setEditing((e) => !e)} showActions={allowPosting} locked={locked} canPost={canPost} onPost={() => setConfirming(true)} />
  );
  if (!compact) {
    return (
      <div ref={rootRef} tabIndex={-1} className={cn('rounded-lg border border-line bg-canvas p-3 text-sm transition-shadow focus:outline-none motion-reduce:transition-none', flashed && 'ring-2 ring-blue-500')}>
        <FindingHeader finding={finding} info={info} />
        {finding.body !== finding.title && <NoteMarkdown className="mt-2 text-fg-muted">{finding.body}</NoteMarkdown>}
        <FindingProof verification={finding.verification} />
        {comment}
        {confirm}
      </div>
    );
  }
  return (
    <div ref={rootRef} tabIndex={-1} className={cn('rounded-lg border border-line text-sm transition-shadow focus:outline-none', flashed && 'ring-2 ring-blue-500')}>
      <div className="flex items-start gap-2 px-3 py-2">
        <button type="button" aria-expanded={expanded} onClick={() => { if (!expanded) onFocus?.(finding.id); setExpanded((e) => !e); }} className="flex min-w-0 flex-1 items-start gap-2 text-left">
          <SeverityDot level={finding.severity} className="mt-1.5" />
          <span className="min-w-0 flex-1 font-medium leading-snug"><span className="sr-only">{finding.severity}: </span>{finding.title}</span>
          <ChevronRight className={cn('mt-0.5 size-4 shrink-0 text-fg-subtle transition-transform motion-reduce:transition-none', expanded && 'rotate-90')} aria-hidden />
        </button>
        {info ? <PostedBadge info={info} /> : canPost && <Button size="sm" onClick={() => setConfirming(true)} title="Add this comment to your pending review">Add</Button>}
      </div>
      {expanded && (
        <div className="border-t border-line px-3 pb-3 pt-2">
          {finding.path && (
            <button type="button" onClick={() => onFocus?.(finding.id)} title="Show it in the diff" className="break-all text-left font-mono text-xs text-blue-600 hover:underline dark:text-blue-400">{finding.path}{finding.line ? `:${finding.line}` : ''}</button>
          )}
          {body && <ClampedNote className="mt-2 text-fg-muted">{body}</ClampedNote>}
          <FindingProof verification={finding.verification} />
          {comment}
        </div>
      )}
      {confirm}
    </div>
  );
}
