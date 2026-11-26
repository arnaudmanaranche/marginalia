import { MessagesSquare, Pencil, Send, X } from 'lucide-react';
import type { Finding, PostedInfo } from '../lib/api';
import type { RaisedBy } from '../lib/raisedElsewhere';
import { cn } from '../lib/utils';
import { Button } from './ui/Button';
import { CopyButton } from './CopyButton';
import { NoteMarkdown } from './NoteMarkdown';
import { PostedBadge } from './PostedBadge';
import { RecapMark } from './RecapMark';
import { SeverityBadge } from './ds/Severity';

export function findingTarget(finding: Finding) {
  return finding.path ? { path: finding.path, ...(finding.line ? { line: finding.line } : {}) } : null;
}

export function FindingHeader({ finding, info }: { finding: Finding; info: PostedInfo | undefined }) {
  return (
    <div className="flex flex-wrap items-center gap-2">
      <SeverityBadge level={finding.severity} />
      <span className="font-medium">{finding.title}</span>
      {finding.path && <code className="break-all text-xs text-fg-muted">{finding.path}{finding.line ? `:${finding.line}` : ''}</code>}
      <RecapMark id={finding.id} />
      <PostedBadge info={info} />
    </div>
  );
}

// The comment to post: read, or edited in place (a finding without a comment starts in the editor).
export function CommentArea({ finding, text, onText, editing, onEditing, showActions, locked, canPost, onPost }: {
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
          className="w-full resize-y rounded-md border border-line-strong bg-surface p-2 text-sm outline-none focus-visible:border-run focus-visible:ring-2 focus-visible:ring-run/40"
        />
      ) : (
        <div className="whitespace-pre-wrap rounded-md border border-blue-500/30 bg-blue-500/5 p-2">{text}</div>
      )}
      {!showActions && text.trim() && (
        <div className="mt-3 flex gap-2"><CopyButton label="Copy" getText={() => text} /></div>
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

// Folded: who raised the point first and what they said, with a way to comment on it anyway, or
// only to read the comment where nothing can be posted (an own review, posting off).
export function RaisedCard({ finding, raised, canPost, onFocus, onUnfold }: { finding: Finding; raised: RaisedBy; canPost: boolean; onFocus?: (id: string) => void; onUnfold: () => void }) {
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
        <Button size="sm" variant="ghost" className="-ml-2 mt-2" onClick={onUnfold}>{canPost ? 'Comment anyway' : 'Show the comment'}</Button>
      </div>
    </div>
  );
}
