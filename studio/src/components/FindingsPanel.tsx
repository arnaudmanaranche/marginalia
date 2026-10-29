import { useEffect, useRef, useState } from 'react';
import { ChevronRight, MessagesSquare, Pencil, Send, X } from 'lucide-react';
import type { Finding, PostedInfo, Thread } from '../lib/api';
import { addToReview } from '../lib/pendingPosts';
import { raisedElsewhere, type RaisedBy } from '../lib/raisedElsewhere';
import { cn } from '../lib/utils';
import { scrollInPane, type Focus } from '../lib/tourFocus';
import { Badge } from './ui/Badge';
import type { BadgeTone } from './ui/badgeStyles';
import { Button } from './ui/Button';
import { ConfirmPost } from './ConfirmPost';
import { NoteMarkdown } from './NoteMarkdown';
import { PostedBadge } from './PostedBadge';

const TONE: Record<Finding['severity'], BadgeTone> = { critical: 'danger', important: 'warning', suggestion: 'info', info: 'neutral' };
const DOT: Record<Finding['severity'], string> = { critical: 'bg-red-500', important: 'bg-amber-500', suggestion: 'bg-blue-500', info: 'bg-zinc-400' };

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

function findingTarget(finding: Finding) {
  return finding.path ? { path: finding.path, ...(finding.line ? { line: finding.line } : {}) } : null;
}

function FindingHeader({ finding, info }: { finding: Finding; info: PostedInfo | undefined }) {
  return (
    <div className="flex flex-wrap items-center gap-2">
      <Badge tone={TONE[finding.severity]}>{finding.severity}</Badge>
      <span className="font-medium">{finding.title}</span>
      {finding.path && <code className="break-all text-xs text-fg-muted">{finding.path}{finding.line ? `:${finding.line}` : ''}</code>}
      <PostedBadge info={info} />
    </div>
  );
}

// The comment to post: read, or edited in place (a finding without a comment starts in the editor).
function CommentArea({ finding, text, onText, editing, onEditing, showActions, locked, canPost, onPost }: {
  finding: Finding;
  text: string;
  onText: (t: string) => void;
  editing: boolean;
  onEditing: () => void;
  showActions: boolean;
  locked: boolean;
  canPost: boolean;
  onPost: () => void;
}) {
  return (
    <div className="mt-2">
      {editing || !finding.comment ? (
        <textarea
          value={text}
          onChange={(e) => onText(e.target.value)}
          rows={Math.min(10, Math.max(3, text.split('\n').length + 1))}
          placeholder={finding.comment ? undefined : 'Write the comment to post on this point'}
          aria-label={`Comment on: ${finding.title}`}
          className="w-full resize-y rounded-md border border-line-strong bg-surface p-2 text-sm outline-none focus-visible:border-blue-500 focus-visible:ring-2 focus-visible:ring-blue-500/50"
        />
      ) : (
        <div className="whitespace-pre-wrap rounded-md border border-blue-500/30 bg-blue-500/5 p-2">{text}</div>
      )}
      <div className={cn('mt-3 flex gap-2', !showActions && 'hidden')}>
        {finding.comment && (
          <Button size="sm" variant="ghost" disabled={locked} onClick={onEditing}>
            {editing ? <X className="size-3.5" /> : <Pencil className="size-3.5" />}{editing ? 'Done' : 'Edit'}
          </Button>
        )}
        <Button size="sm" variant="primary" disabled={!canPost} onClick={onPost}>
          <Send className="size-3.5" />Add to review
        </Button>
      </div>
    </div>
  );
}

// Folded: who raised the point first and what they said, with a way to comment on it anyway.
function RaisedCard({ finding, raised, onFocus, onUnfold }: { finding: Finding; raised: RaisedBy; onFocus?: (id: string) => void; onUnfold: () => void }) {
  const { path, line, resolved } = raised.thread;
  const where = path ? `${path.split('/').pop()}${line ? `:${line}` : ''}` : 'the MR';
  return (
    <div className="flex gap-2 rounded-lg border border-dashed border-line-strong px-3 py-2 text-sm text-fg-muted">
      <MessagesSquare className="mt-0.5 size-4 shrink-0 text-fg-subtle" aria-hidden />
      <div className="min-w-0 flex-1">
        <p className="font-medium leading-snug text-zinc-900 dark:text-zinc-100"><span className="sr-only">{finding.severity}: </span>{finding.title}</p>
        <p className="mt-0.5 text-xs">
          Already raised by {raised.author} in a {resolved ? 'resolved' : 'open'} thread on{' '}
          <button type="button" onClick={() => onFocus?.(finding.id)} title={`${path}${line ? `:${line}` : ''} (show it in the diff)`} className="break-all font-mono text-blue-600 hover:underline dark:text-blue-400">{where}</button>
        </p>
        <NoteMarkdown className="mt-1.5 line-clamp-4 border-l-2 border-line-strong pl-2 text-xs text-fg-muted prose-p:my-0">{raised.body}</NoteMarkdown>
        <Button size="sm" variant="ghost" className="-ml-2 mt-2" onClick={onUnfold}>Comment anyway</Button>
      </div>
    </div>
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
  const [flash, setFlash] = useState(false);
  // Chosen in the diff: open it here, bring it into view, and light it up for a moment.
  useEffect(() => {
    if (focus?.source !== 'diff' || focus.id !== finding.id) return undefined;
    setExpanded(true);
    requestAnimationFrame(() => rootRef.current && scrollInPane(rootRef.current, 'nearest', 56));
    setFlash(true);
    const t = setTimeout(() => setFlash(false), 1800);
    return () => clearTimeout(t);
  }, [focus, finding.id]);
  const info = posted[`${slug}:${finding.id}`];
  // Once posted it is mine whatever the thread says: it shows as posted, not as folded.
  if (raised && !info && !unfolded) return <div ref={rootRef} tabIndex={-1} className={cn('rounded-lg transition-shadow focus:outline-none', flash && 'ring-2 ring-blue-500')}><RaisedCard finding={finding} raised={raised} onFocus={onFocus} onUnfold={() => { setUnfolded(true); setExpanded(true); }} /></div>;
  const target = findingTarget(finding);
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
      <div ref={rootRef} tabIndex={-1} className="rounded-lg border border-line bg-canvas p-3 text-sm focus:outline-none">
        <FindingHeader finding={finding} info={info} />
        {finding.body !== finding.title && <NoteMarkdown className="mt-2 text-fg-muted">{finding.body}</NoteMarkdown>}
        {comment}
        {confirm}
      </div>
    );
  }
  return (
    <div ref={rootRef} tabIndex={-1} className={cn('rounded-lg border border-line text-sm transition-shadow focus:outline-none', flash && 'ring-2 ring-blue-500')}>
      <div className="flex items-start gap-2 px-3 py-2">
        <button type="button" aria-expanded={expanded} onClick={() => { if (!expanded) onFocus?.(finding.id); setExpanded((e) => !e); }} className="flex min-w-0 flex-1 items-start gap-2 text-left">
          <span className={cn('mt-1.5 size-2 shrink-0 rounded-full', DOT[finding.severity])} aria-hidden />
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
          {finding.body !== finding.title && <NoteMarkdown className="mt-2 text-fg-muted">{finding.body}</NoteMarkdown>}
          {comment}
        </div>
      )}
      {confirm}
    </div>
  );
}
