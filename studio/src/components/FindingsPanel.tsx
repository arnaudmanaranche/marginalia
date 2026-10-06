import { useRef, useState } from 'react';
import { Check, ExternalLink, Pencil, Send, X } from 'lucide-react';
import { toast } from 'sonner';
import { postComment, type Finding, type PostedInfo } from '../lib/api';
import { cn, timeAgo } from '../lib/utils';
import { Badge, badgeClass, type BadgeTone } from './ui/Badge';
import { Button } from './ui/Button';
import { ConfirmPost } from './ConfirmPost';

const TONE: Record<Finding['severity'], BadgeTone> = { critical: 'danger', important: 'warning', suggestion: 'info', info: 'neutral' };

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
export function FindingsPanel({ findings, ...post }: { findings: Finding[] } & PostProps) {
  return (
    <ul className="space-y-3">
      {findings.map((f) => (
        <li key={f.id}><FindingCard finding={f} {...post} /></li>
      ))}
    </ul>
  );
}

function FindingCard({ finding, slug, iid, allowPosting, locked, posted, reload }: { finding: Finding } & PostProps) {
  const [text, setText] = useState(finding.comment ?? '');
  const [editing, setEditing] = useState(false);
  const [confirming, setConfirming] = useState(false);
  const rootRef = useRef<HTMLDivElement>(null);
  const info = posted[`${slug}:${finding.id}`];
  const target = finding.path ? { path: finding.path, ...(finding.line ? { line: finding.line } : {}) } : null;
  const canPost = allowPosting && !info && !locked && text.trim().length > 0;
  return (
    <div ref={rootRef} tabIndex={-1} className="rounded-lg border border-zinc-200 bg-zinc-50 p-3 text-sm focus:outline-none dark:border-zinc-800 dark:bg-zinc-950">
      <div className="flex flex-wrap items-center gap-2">
        <Badge tone={TONE[finding.severity]}>{finding.severity}</Badge>
        <span className="font-medium">{finding.title}</span>
        {finding.path && <code className="break-all text-xs text-fg-muted">{finding.path}{finding.line ? `:${finding.line}` : ''}</code>}
        {info?.state === 'draft' && <Badge tone="warning" ring><Check className="size-3" />In pending review</Badge>}
        {info && info.state !== 'draft' && (
          <a href={info.url} target="_blank" rel="noreferrer" className={badgeClass({ tone: 'success', ring: true })}>
            <Check className="size-3" />Posted {timeAgo(info.at)}<ExternalLink className="size-3" />
          </a>
        )}
      </div>
      {finding.body !== finding.title && <p className="mt-2 whitespace-pre-wrap text-fg-muted">{finding.body}</p>}
      {!info && (
        <div className="mt-2">
          {editing || !finding.comment ? (
            <textarea
              value={text}
              onChange={(e) => setText(e.target.value)}
              rows={Math.min(10, Math.max(3, text.split('\n').length + 1))}
              placeholder={finding.comment ? undefined : 'Write the comment to post on this point'}
              aria-label={`Comment on: ${finding.title}`}
              className="w-full resize-y rounded-md border border-zinc-300 bg-white p-2 text-sm outline-none focus-visible:border-blue-500 focus-visible:ring-2 focus-visible:ring-blue-500/50 dark:border-zinc-700 dark:bg-zinc-900"
            />
          ) : (
            <div className="whitespace-pre-wrap rounded-md border border-blue-500/30 bg-blue-500/5 p-2">{text}</div>
          )}
          <div className={cn('mt-1 flex gap-1', !allowPosting && 'hidden')}>
            {finding.comment && (
              <Button size="sm" variant="ghost" disabled={locked} onClick={() => setEditing((e) => !e)}>
                {editing ? <X className="size-3.5" /> : <Pencil className="size-3.5" />}{editing ? 'Done' : 'Edit'}
              </Button>
            )}
            <Button size="sm" variant="primary" disabled={!canPost} onClick={() => setConfirming(true)}>
              <Send className="size-3.5" />Add to review
            </Button>
          </div>
        </div>
      )}
      {confirming && (
        <ConfirmPost
          iid={iid}
          text={text.trim()}
          target={target}
          fallbackRef={rootRef}
          onCancel={() => setConfirming(false)}
          onConfirm={async () => {
            const result = await postComment(slug, finding.id, text.trim(), target ?? undefined);
            setConfirming(false);
            reload();
            if (target && result.inline === false) toast.warning('Could not anchor it to the diff, added as a general comment');
            toast.success(`Added to your pending review of !${iid}`, { description: 'Submit the review to publish it.' });
          }}
        />
      )}
    </div>
  );
}
