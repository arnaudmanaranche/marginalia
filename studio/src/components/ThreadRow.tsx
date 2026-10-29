import { MessageSquare } from 'lucide-react';
import type { Thread } from '../lib/api';
import { cn, timeAgo } from '../lib/utils';
import { Badge } from './ui/Badge';
import { NoteMarkdown } from './NoteMarkdown';

// One GitLab thread as it reads in the diff: who said what, in order, and whether it is settled.
export function ThreadCard({ thread, showPlace, flash }: { thread: Thread; showPlace?: boolean; flash?: boolean }) {
  const settled = thread.resolved;
  // The header only says what the comment itself does not: how many, where, its state.
  const many = thread.notes.length > 1;
  const place = showPlace && thread.line != null;
  const head = many || place || settled || thread.outdated;
  return (
    <div data-thread={thread.id} className={cn('rounded-md border px-3 py-2 font-sans text-sm transition-shadow', settled ? 'border-line bg-strip' : 'border-violet-500/30 bg-violet-500/5', flash && 'ring-2 ring-blue-500')}>
      {head && (
        <div className="mb-1 flex flex-wrap items-center gap-2 text-xs text-fg-muted">
          {many && <span className="inline-flex items-center gap-1"><MessageSquare className="size-3.5" aria-hidden />{thread.notes.length} comments</span>}
          {place && <code>line {thread.line}</code>}
          {settled && <Badge tone="success">Resolved</Badge>}
          {thread.outdated && <Badge tone="neutral">Earlier version</Badge>}
        </div>
      )}
      <ul className="space-y-2">
        {thread.notes.map((n) => (
          <li key={n.id}>
            <p className="text-xs text-fg-muted"><span className="font-medium text-fg">{n.mine ? 'You' : n.authorName ?? n.author}</span> · {timeAgo(n.at)}</p>
            <NoteMarkdown className={cn(settled && 'opacity-70')}>{n.body}</NoteMarkdown>
          </li>
        ))}
      </ul>
    </div>
  );
}

// A table row carrying a thread under the line it is about.
export function ThreadRow({ thread, flash }: { thread: Thread; flash?: boolean }) {
  return (
    <tr>
      <td colSpan={3} className="px-3 py-1.5"><ThreadCard thread={thread} flash={flash} /></td>
    </tr>
  );
}
