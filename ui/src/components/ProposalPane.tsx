import { useEffect, useRef, useState } from 'react';
import { ArrowUpRight, Check, Pencil, Send, X } from 'lucide-react';
import type { Proposal } from '../lib/approvalsApi';
import { findingRoute } from '../lib/hashRoute';
import { addToReview } from '../lib/pendingPosts';
import { ConfirmPost } from './ConfirmPost';
import { CopyButton } from './CopyButton';
import { NoteMarkdown } from './NoteMarkdown';
import { Kbd } from './ds/Kbd';
import { SeverityBadge } from './ds/Severity';
import { Button } from './ui/Button';

// Keys are ignored while the person types or a dialog is open.
const typing = (e: KeyboardEvent) => e.metaKey || e.ctrlKey || e.altKey || (e.target instanceof HTMLElement && (e.target.isContentEditable || ['INPUT', 'TEXTAREA', 'SELECT'].includes(e.target.tagName)));

// One proposed comment, read in full: the MR, how much it matters, the point and why, and the comment
// as it would be sent. Add it (after the same preview as everywhere), edit it first, or dismiss it,
// with a click or a key: a adds, e edits, d dismisses, j and k move. Nothing is sent without that.
export function ProposalPane({ proposal: p, canPost, busy, onDismiss, onMove, onOpen, reload }: {
  proposal: Proposal; canPost: boolean; busy: boolean; onDismiss: () => void; onMove: (by: 1 | -1) => void; onOpen: (slug: string) => void; reload: () => void;
}) {
  const [text, setText] = useState(p.comment);
  const [editing, setEditing] = useState(false);
  const [confirming, setConfirming] = useState(false);
  const opener = useRef<HTMLButtonElement>(null);
  const target = p.path ? { path: p.path, ...(p.line ? { line: p.line } : {}) } : null;
  const edited = text.trim() !== p.comment.trim();
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (typing(e) || confirming || document.querySelector('[role="dialog"]')) return;
      if (e.key === 'j') onMove(1);
      else if (e.key === 'k') onMove(-1);
      else if (e.key === 'e') { e.preventDefault(); setEditing(true); }
      else if (e.key === 'd' && !busy) onDismiss();
      else if (e.key === 'a' && canPost && !busy && text.trim()) setConfirming(true);
      else return;
    };
    document.addEventListener('keydown', onKey);
    return () => document.removeEventListener('keydown', onKey);
  }, [confirming, busy, canPost, text, onMove, onDismiss]);
  return (
    <article aria-label={p.title} className="rounded-xl border border-line bg-surface">
      <header className="border-b border-line px-5 py-4">
        <button type="button" onClick={() => onOpen(p.slug)} className="group inline-flex max-w-full items-center gap-1 text-xs text-fg-muted hover:text-zinc-900 dark:hover:text-zinc-100">
          <span className="truncate">{p.mrTitle}</span><span className="shrink-0 tabular-nums">!{p.iid}</span>
          <ArrowUpRight className="size-3 shrink-0 opacity-0 transition-opacity group-hover:opacity-100" aria-hidden />
        </button>
        <div className="mt-2 flex flex-wrap items-center gap-2">
          <SeverityBadge level={p.severity} />
          <h2 className="min-w-0 text-base font-medium">{p.title}</h2>
        </div>
        {(p.path || p.criticalPaths.length > 0) && (
          <p className="mt-1.5 flex flex-wrap gap-x-3 gap-y-1 text-xs text-fg-muted">
            {p.path && (
              <button type="button" onClick={() => onOpen(findingRoute(p.slug, p.findingId))} title="Open the review on this finding" className="text-left font-mono underline decoration-line-strong underline-offset-2 [overflow-wrap:anywhere] hover:text-zinc-900 hover:decoration-current dark:hover:text-zinc-100">
                {p.path}{p.line ? `:${p.line}` : ''}
              </button>
            )}
            {p.criticalPaths.length > 0 && <span>Touches {p.criticalPaths.join(', ')}</span>}
          </p>
        )}
      </header>
      <div className="space-y-4 px-5 py-4">
        {p.body && p.body !== p.title && <NoteMarkdown className="text-sm text-fg-muted">{p.body}</NoteMarkdown>}
        <div>
          <p className="mb-1.5 text-xs text-fg-muted">The comment{edited ? ' · edited' : ''}</p>
          {editing ? (
            <textarea
              autoFocus value={text} onChange={(e) => setText(e.target.value)} onKeyDown={(e) => e.key === 'Escape' && setEditing(false)} aria-label="Edit the comment"
              rows={Math.min(14, Math.max(4, text.split('\n').length + 1))}
              className="w-full resize-y rounded-lg border border-line-strong bg-canvas p-3 text-sm leading-relaxed outline-none focus-visible:border-run focus-visible:ring-2 focus-visible:ring-run/40"
            />
          ) : (
            <p className="whitespace-pre-wrap rounded-lg bg-canvas p-3 text-sm leading-relaxed ring-1 ring-inset ring-line [overflow-wrap:anywhere]">{text}</p>
          )}
        </div>
      </div>
      <footer className="flex flex-wrap items-center gap-2 border-t border-line px-5 py-3">
        {canPost ? (
          <Button ref={opener} size="sm" variant="primary" disabled={busy || !text.trim()} onClick={() => setConfirming(true)} title="Preview it, then add it to your pending review">
            <Send className="size-3.5" />Add to review<Kbd>a</Kbd>
          </Button>
        ) : <CopyButton label="Copy" getText={() => text} />}
        <Button size="sm" variant="ghost" disabled={busy} onClick={() => setEditing((x) => !x)}>
          {editing ? <Check className="size-3.5" /> : <Pencil className="size-3.5" />}{editing ? 'Done' : 'Edit'}<Kbd>e</Kbd>
        </Button>
        <Button size="sm" variant="ghost" disabled={busy} onClick={onDismiss} title="Not worth saying: nothing is sent">
          <X className="size-3.5" />Dismiss<Kbd>d</Kbd>
        </Button>
        <span className="ml-auto hidden items-center gap-1 text-xs text-fg-muted sm:flex"><Kbd>j</Kbd><Kbd>k</Kbd> to move</span>
      </footer>
      {confirming && (
        <ConfirmPost
          iid={p.iid} text={text} target={target} fallbackRef={opener}
          onCancel={() => setConfirming(false)}
          onConfirm={() => { setConfirming(false); addToReview({ slug: p.slug, iid: p.iid, commentId: p.findingId, body: text, target: target ?? undefined, reload }); }}
        />
      )}
    </article>
  );
}
