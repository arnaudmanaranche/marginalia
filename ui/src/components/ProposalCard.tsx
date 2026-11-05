import { useRef, useState } from 'react';
import { Check, Pencil, Send, X } from 'lucide-react';
import type { Finding } from '../lib/api';
import type { Proposal } from '../lib/approvalsApi';
import { addToReview } from '../lib/pendingPosts';
import { Badge } from './ui/Badge';
import type { BadgeTone } from './ui/badgeStyles';
import { Button } from './ui/Button';
import { ConfirmPost } from './ConfirmPost';

const TONE: Record<Finding['severity'], BadgeTone> = { critical: 'danger', important: 'warning', suggestion: 'info', info: 'neutral' };

// One proposed comment, waiting for a person: add it to the pending review as is or edited (after
// the same preview as on the review page), or dismiss it. Nothing is sent without that click.
export function ProposalCard({ proposal: p, canPost, onDismiss, busy, reload }: { proposal: Proposal; canPost: boolean; onDismiss: () => void; busy: boolean; reload: () => void }) {
  const [text, setText] = useState(p.comment);
  const [editing, setEditing] = useState(false);
  const [confirming, setConfirming] = useState(false);
  const opener = useRef<HTMLButtonElement>(null);
  const target = p.path ? { path: p.path, ...(p.line ? { line: p.line } : {}) } : null;
  return (
    <li className="p-4">
      <div className="flex flex-wrap items-center gap-2">
        <Badge tone={TONE[p.severity]}>{p.severity}</Badge>
        <span className="min-w-0 font-medium">{p.title}</span>
        {p.path && <code className="min-w-0 truncate font-mono text-xs text-fg-muted" title={p.path}>{p.path}{p.line ? `:${p.line}` : ''}</code>}
      </div>
      {editing ? (
        <textarea
          autoFocus value={text} onChange={(e) => setText(e.target.value)} aria-label={`Edit the comment on: ${p.title}`}
          rows={Math.min(12, Math.max(3, text.split('\n').length + 1))}
          className="mt-2 w-full resize-y rounded-md border border-line-strong bg-surface p-2 text-sm outline-none focus-visible:border-blue-500 focus-visible:ring-2 focus-visible:ring-blue-500/50"
        />
      ) : (
        <p className="mt-2 whitespace-pre-wrap rounded-md border border-line bg-canvas p-2 text-sm [overflow-wrap:anywhere]">{text}</p>
      )}
      <div className="mt-3 flex flex-wrap items-center gap-2">
        <Button ref={opener} size="sm" disabled={!canPost || busy || !text.trim()} title={canPost ? 'Preview it, then add it to your pending review' : 'Posting is off in this studio'} onClick={() => setConfirming(true)}>
          <Send className="size-3.5" />Add to review{text.trim() !== p.comment.trim() ? ' (edited)' : ''}
        </Button>
        <Button size="sm" variant="ghost" disabled={busy} onClick={() => setEditing((e) => !e)}>
          {editing ? <Check className="size-3.5" /> : <Pencil className="size-3.5" />}{editing ? 'Done' : 'Edit'}
        </Button>
        <Button size="sm" variant="ghost" disabled={busy} onClick={onDismiss} title="Not worth saying: nothing is sent">
          <X className="size-3.5" />Dismiss
        </Button>
      </div>
      {confirming && (
        <ConfirmPost
          iid={p.iid} text={text} target={target} fallbackRef={opener}
          onCancel={() => setConfirming(false)}
          onConfirm={() => {
            setConfirming(false);
            addToReview({ slug: p.slug, iid: p.iid, commentId: p.findingId, body: text, target: target ?? undefined, reload });
          }}
        />
      )}
    </li>
  );
}
