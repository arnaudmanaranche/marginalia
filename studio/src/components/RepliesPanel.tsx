import { useState } from 'react';
import { toast } from '../lib/toast';
import { Check, Crosshair, Loader2, Reply as ReplyIcon, Trash2, Upload } from 'lucide-react';
import { deleteDraft, postReply, pushFixes, type FixesStatus, type PostedInfo, type Reply, type ReplyVerdict, type Thread } from '../lib/api';
import { landedFix, pendingFix, replyBody } from '../lib/replies';
import { Badge } from './ui/Badge';
import type { BadgeTone } from './ui/badgeStyles';
import { Button } from './ui/Button';
import { cn } from '../lib/utils';
import { ThreadCard } from './ThreadRow';

const VERDICTS: Record<ReplyVerdict, { label: string; tone: BadgeTone }> = {
  fixed: { label: 'Fixed by the triage', tone: 'success' },
  already_fixed: { label: 'Already fixed', tone: 'success' },
  not_relevant: { label: 'Not relevant', tone: 'neutral' },
  wrong: { label: 'Disagree', tone: 'warning' },
  answered: { label: 'Answered', tone: 'info' },
};

const short = (sha: string | null) => sha?.slice(0, 8) ?? '';

// One card per reviewer thread of my own MR: the conversation, what the triage made of it, and my
// answer, editable, added to my pending replies in that thread. A "fixed" reply waits until its fix
// is pushed, then names the commit; the fix can be pushed from the card, alone. With `onSelect`, a
// thread on a file can be pointed at in the diff.
export function RepliesPanel({ slug, threads, replies, posted, fixes, onFixes, locked, reload, selected = null, onSelect }: {
  slug: string;
  threads: Thread[];
  replies: Reply[];
  posted: Record<string, PostedInfo>;
  fixes: FixesStatus | null;
  // The fixes as they stand after one was pushed from a card.
  onFixes: (fixes: FixesStatus) => void;
  locked: boolean;
  reload: () => void;
  selected?: string | null;
  onSelect?: (id: string) => void;
}) {
  if (!threads.length) return <p className="text-sm text-fg-muted">No open reviewer thread on this MR.</p>;
  return (
    <ul className="space-y-4">
      {threads.map((t) => (
        <li key={t.id}>
          <ReplyCard slug={slug} thread={t} drafted={replies.find((r) => r.thread === t.id) ?? null} sent={posted[`${slug}:reply-${t.id}`] ?? null} fixes={fixes} onFixes={onFixes} locked={locked} reload={reload} selected={selected === t.id} onSelect={onSelect} />
        </li>
      ))}
    </ul>
  );
}

function ReplyCard({ slug, thread, drafted, sent, fixes, onFixes, locked, reload, selected, onSelect }: {
  slug: string;
  thread: Thread;
  drafted: Reply | null;
  sent: PostedInfo | null;
  fixes: FixesStatus | null;
  onFixes: (fixes: FixesStatus) => void;
  locked: boolean;
  reload: () => void;
  selected: boolean;
  onSelect?: (id: string) => void;
}) {
  const [text, setText] = useState(drafted?.reply ?? '');
  const [resolve, setResolve] = useState(drafted?.resolve ?? false);
  const [busy, setBusy] = useState(false);
  const fixed = drafted?.verdict === 'fixed';
  // A fix is only worth announcing once the reviewer can see it on the MR.
  const landed = landedFix(thread.id, fixes, drafted?.commit);
  const body = replyBody(text, fixed, landed);
  const waitingForPush = body === null;
  const verdict = drafted ? VERDICTS[drafted.verdict] : null;

  const add = async () => {
    setBusy(true);
    try {
      if (body === null) return;
      await postReply(slug, thread.id, body, resolve);
      toast.success('Reply added to your pending replies');
      reload();
    } catch (e) {
      toast.error('Could not add the reply', { description: (e as Error).message });
    } finally {
      setBusy(false);
    }
  };
  const remove = async () => {
    if (sent?.draftId === undefined) return;
    setBusy(true);
    try {
      await deleteDraft(slug, sent.draftId);
      reload();
    } catch (e) {
      toast.error('Could not remove the reply', { description: (e as Error).message });
    } finally {
      setBusy(false);
    }
  };

  return (
    <div className={cn('space-y-2 rounded-lg border p-3', selected ? 'border-blue-500 ring-1 ring-blue-500' : 'border-zinc-200 dark:border-zinc-800')}>
      <div className="flex flex-wrap items-center gap-2 text-xs text-fg-muted">
        {thread.path && onSelect ? (
          <button onClick={() => onSelect(thread.id)} title="Show it in the diff" aria-pressed={selected} className="inline-flex min-w-0 items-center gap-1.5 rounded text-left hover:text-fg focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-blue-500">
            <Crosshair className="size-3.5 shrink-0" aria-hidden /><code className="break-all">{thread.path}{thread.line ? `:${thread.line}` : ''}</code>
          </button>
        ) : thread.path ? <code>{thread.path}{thread.line ? `:${thread.line}` : ''}</code> : <span>General comment</span>}
        {verdict ? <Badge tone={verdict.tone}>{verdict.label}</Badge> : <Badge tone="neutral">No drafted reply</Badge>}
      </div>
      <ThreadCard thread={thread} />
      {sent ? (
        <div className="space-y-2 rounded-md bg-zinc-50 p-3 text-sm dark:bg-zinc-900">
          <p className="flex flex-wrap items-center gap-2 text-xs text-fg-muted">
            <Check className="size-3.5" aria-hidden />
            {sent.state === 'published' ? 'Sent' : 'In your pending replies'}{sent.resolve ? ', resolves the thread' : ''}
          </p>
          <p className="whitespace-pre-wrap leading-relaxed">{sent.body}</p>
          {sent.state === 'draft' && (
            <Button size="sm" disabled={busy || locked} onClick={remove}>
              {busy ? <Loader2 className="size-3.5 animate-spin motion-reduce:animate-pulse" /> : <Trash2 className="size-3.5" />}Remove
            </Button>
          )}
        </div>
      ) : (
        <div className="space-y-2">
          <textarea
            aria-label="Your reply"
            value={text}
            onChange={(e) => setText(e.target.value)}
            placeholder="Your answer to the reviewer"
            rows={Math.min(10, Math.max(3, text.split('\n').length + 1))}
            className="w-full resize-y rounded-md border border-zinc-300 bg-white p-3 text-sm leading-relaxed outline-none focus-visible:border-blue-500 focus-visible:ring-2 focus-visible:ring-blue-500/50 dark:border-zinc-700 dark:bg-zinc-900"
          />
          {fixed && (landed
            ? <p className="text-xs text-fg-muted">Ends with <code>Fixed in {short(landed)}.</code></p>
            : <PushOne slug={slug} threadId={thread.id} fixes={fixes} locked={locked} onFixes={onFixes} />)}
          <div className="flex flex-wrap items-center justify-between gap-2">
            <label className="flex items-center gap-2 text-sm">
              <input type="checkbox" checked={resolve} disabled={!thread.resolvable} onChange={(e) => setResolve(e.target.checked)} />
              Resolve the thread
            </label>
            <Button size="sm" variant="primary" disabled={busy || locked || waitingForPush || !text.trim()} onClick={add}>
              {busy ? <Loader2 className="size-3.5 animate-spin motion-reduce:animate-pulse" /> : <ReplyIcon className="size-3.5" />}Add reply
            </Button>
          </div>
        </div>
      )}
    </div>
  );
}

// The fix of one thread, not on the MR yet: pushed from here alone, after a second click that says
// where it goes. The merge settling the conflicts goes first, from "Fixes to push": the fixes were
// made on top of it.
function PushOne({ slug, threadId, fixes, locked, onFixes }: { slug: string; threadId: string; fixes: FixesStatus | null; locked: boolean; onFixes: (fixes: FixesStatus) => void }) {
  const [confirming, setConfirming] = useState(false);
  const [busy, setBusy] = useState(false);
  const fix = pendingFix(threadId, fixes);
  if (!fix || !fixes) return <p className="text-xs text-fg-muted">Push the fixes first: this reply names the commit that fixed it.</p>;
  const oldest = fixes.commits[fixes.commits.length - 1];
  const mergeFirst = oldest?.merge && oldest.sha !== fix.sha;
  if (mergeFirst) return <p className="text-xs text-fg-muted">Its fix <code>{short(fix.sha)}</code> was made on top of the merge that settles the conflicts: push that one first, under Fixes to push.</p>;

  const push = async () => {
    setBusy(true);
    try {
      const after = await pushFixes(slug, fix.sha);
      onFixes(after);
      toast.success(`Fix pushed to ${fixes.branch}`, after.note ? { description: after.note } : undefined);
    } catch (e) {
      toast.error('Could not push this fix', { description: (e as Error).message });
    } finally {
      setBusy(false);
      setConfirming(false);
    }
  };
  return (
    <div className="flex flex-wrap items-center gap-2 text-xs text-fg-muted">
      {confirming ? (
        <>
          <span>Push <code>{short(fix.sha)}</code> alone to <code>{fixes.branch}</code>?{fixes.commits.length > 1 && ' The other fixes stay to push.'}</span>
          <Button size="sm" variant="primary" disabled={busy || locked} onClick={push}>
            {busy ? <Loader2 className="size-3.5 animate-spin motion-reduce:animate-pulse" /> : <Upload className="size-3.5" />}Push
          </Button>
          <Button size="sm" disabled={busy} onClick={() => setConfirming(false)}>Cancel</Button>
        </>
      ) : (
        <>
          <span>Its fix <code>{short(fix.sha)}</code> is not on the MR yet: the reply names it once pushed.</span>
          <Button size="sm" disabled={locked} onClick={() => setConfirming(true)}><Upload className="size-3.5" />Push this fix</Button>
        </>
      )}
    </div>
  );
}
