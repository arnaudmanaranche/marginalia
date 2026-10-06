import { useCallback, useEffect, useState } from 'react';
import { MessageSquare, Send } from 'lucide-react';
import { toast } from 'sonner';
import { fetchDiscussions, replyToDiscussion, type Discussion as Thread } from '../lib/api';
import { timeAgo } from '../lib/utils';
import { Badge } from './ui/Badge';
import { Button } from './ui/Button';

// The MR's GitLab conversation, whatever the review skill wrote: the person can
// answer a thread here (it joins the pending review) even when the author
// says it is fixed. `refreshKey` reloads it when the review or the drafts change.
export function Discussion({ slug, canReply, refreshKey, reload }: { slug: string; canReply: boolean; refreshKey: string; reload: () => void }) {
  const [threads, setThreads] = useState<Thread[] | null>(null);
  const [error, setError] = useState<string | null>(null);
  const load = useCallback(() => {
    fetchDiscussions(slug).then((t) => { setThreads(t); setError(null); }, (e) => setError((e as Error).message));
  }, [slug]);
  useEffect(() => {
    setThreads(null);
    load();
  }, [load, refreshKey]);

  if (error) return <p className="text-sm text-fg-muted">Could not load the GitLab discussion: {error}</p>;
  if (threads === null) return <p className="text-sm text-fg-muted">Loading the discussion…</p>;
  if (!threads.length) return <p className="text-sm text-fg-muted">No comments on this merge request yet.</p>;
  return (
    <ul className="space-y-3">
      {threads.map((t) => (
        <li key={t.id}><ThreadCard thread={t} slug={slug} canReply={canReply} onReplied={() => { load(); reload(); }} /></li>
      ))}
    </ul>
  );
}

function ThreadCard({ thread, slug, canReply, onReplied }: { thread: Thread; slug: string; canReply: boolean; onReplied: () => void }) {
  const [replying, setReplying] = useState(false);
  const [text, setText] = useState('');
  const [busy, setBusy] = useState(false);
  const last = thread.notes[thread.notes.length - 1];
  const send = async () => {
    setBusy(true);
    try {
      await replyToDiscussion(slug, thread.id, text.trim());
      toast.success('Reply added to your pending review', { description: 'It goes out with "Submit review".' });
      setText('');
      setReplying(false);
      onReplied();
    } catch (e) {
      toast.error('Could not add the reply', { description: (e as Error).message });
    }
    setBusy(false);
  };
  return (
    <div className="rounded-lg border border-zinc-200 bg-zinc-50 p-3 text-sm dark:border-zinc-800 dark:bg-zinc-950">
      <div className="mb-2 flex flex-wrap items-center gap-2">
        <code className="break-all text-xs text-fg-muted">{thread.path ? `${thread.path}${thread.line ? `:${thread.line}` : ''}` : 'General comment'}</code>
        {thread.resolved && <Badge>Resolved</Badge>}
      </div>
      <ol className="space-y-2">
        {thread.notes.map((n) => (
          <li key={n.id} className="border-l-2 border-zinc-200 pl-3 dark:border-zinc-700">
            <div className="text-xs text-fg-muted">
              <span className="font-medium text-fg">{n.mine ? 'You' : n.authorName ?? n.author}</span> · {timeAgo(n.at)}
            </div>
            <p className="whitespace-pre-wrap">{n.body}</p>
          </li>
        ))}
      </ol>
      {canReply && (
        <div className="mt-2">
          {replying ? (
            <>
              <textarea value={text} onChange={(e) => setText(e.target.value)} rows={3} aria-label="Your reply" autoFocus className="w-full resize-y rounded-md border border-zinc-300 bg-white p-2 text-sm outline-none focus-visible:border-blue-500 focus-visible:ring-2 focus-visible:ring-blue-500/50 dark:border-zinc-700 dark:bg-zinc-900" />
              <div className="mt-1 flex gap-1">
                <Button size="sm" variant="primary" disabled={busy || !text.trim()} onClick={send}><Send className="size-3.5" />Add to review</Button>
                <Button size="sm" variant="ghost" disabled={busy} onClick={() => { setReplying(false); setText(''); }}>Cancel</Button>
              </div>
            </>
          ) : (
            <Button size="sm" variant="ghost" onClick={() => setReplying(true)}>
              <MessageSquare className="size-3.5" />{last?.mine ? 'Follow up' : 'Reply'}
            </Button>
          )}
        </div>
      )}
    </div>
  );
}
