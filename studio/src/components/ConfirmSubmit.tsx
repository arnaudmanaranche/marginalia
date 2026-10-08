import { useEffect, useEffectEvent, useRef, useState } from 'react';
import { toast } from 'sonner';
import { Loader2, Send } from 'lucide-react';
import { fetchDrafts, type DraftNote, type ReviewAction } from '../lib/api';
import { useScrollLock } from '../lib/useScrollLock';
import { useModalFocus } from '../lib/useModalFocus';
import { Button } from './ui/Button';
import { DraftRow } from './DraftRow';

const ACTIONS: { value: ReviewAction; label: string; submit: string; hint: string }[] = [
  { value: 'comment', label: 'Comment', submit: 'Submit comments', hint: 'Publish your comments without a verdict.' },
  { value: 'approve', label: 'Approve', submit: 'Approve', hint: 'Publish, then approve the MR as you. Refused if the MR changed since this review.' },
  { value: 'request_changes', label: 'Request changes', submit: 'Request changes', hint: 'Publish and mark the MR as needing changes.' },
];

// Publishes the pending review: every draft comment of this MR, plus an optional summary,
// with the verdict the user picks (a triage of your own MR can only comment).
export function ConfirmSubmit({ slug, iid, count, canVerdict, reload, onCancel, onConfirm }: { slug: string; reload: () => void; iid: string | number; count: number; canVerdict: boolean; onCancel: () => void; onConfirm: (summary: string, action: ReviewAction) => Promise<void> }) {
  const [busy, setBusy] = useState(false);
  const [summary, setSummary] = useState('');
  const [action, setAction] = useState<ReviewAction>('comment');
  const chosen = ACTIONS.find((a) => a.value === action)!;
  // Read from GitLab itself, so drafts started in its own UI are listed too.
  const [drafts, setDrafts] = useState<DraftNote[] | null>(null);
  const [draftsError, setDraftsError] = useState<string | null>(null);
  useEffect(() => {
    let live = true;
    fetchDrafts(slug).then((d) => live && setDrafts(d), (e) => live && setDraftsError((e as Error).message));
    return () => {
      live = false;
    };
  }, [slug]);
  const dialogRef = useRef<HTMLDivElement>(null);
  useScrollLock(true);
  useModalFocus(true, dialogRef, { initial: '[data-autofocus]' });
  const onKey = useEffectEvent((e: KeyboardEvent) => e.key === 'Escape' && !busy && onCancel());
  useEffect(() => {
    document.addEventListener('keydown', onKey);
    return () => document.removeEventListener('keydown', onKey);
  }, []);
  return (
    <div role="presentation" className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 px-4" onClick={busy ? undefined : onCancel}>
      <div ref={dialogRef} role="dialog" aria-modal="true" aria-labelledby="confirm-submit-title" className="w-full max-w-lg rounded-xl border border-zinc-200 bg-white p-5 shadow-2xl dark:border-zinc-800 dark:bg-zinc-900" onClick={(e) => e.stopPropagation()}>
        <h2 id="confirm-submit-title" className="text-base font-semibold">Submit your review of !{iid}?</h2>
        <p className="mt-1 text-sm text-fg-muted">{count} pending comment{count === 1 ? '' : 's'} will be published as one review, under your account and visible to the MR author. Drafts started in GitLab itself are published too.</p>
        <div className="mt-3 max-h-60 space-y-2 overflow-y-auto" aria-label="Pending comments" aria-busy={!drafts && !draftsError}>
          {draftsError && <p className="text-sm text-red-600 dark:text-red-400">Could not load the drafts: {draftsError}</p>}
          {!drafts && !draftsError && <p className="text-sm text-fg-muted">Loading…</p>}
          {drafts?.length === 0 && <p className="text-sm text-fg-muted">No pending comment on GitLab.</p>}
          {drafts?.map((d) => (
            <DraftRow key={d.id} slug={slug} draft={d} disabled={busy} onChanged={(next) => { setDrafts((all) => (all ?? []).flatMap((x) => (x.id !== d.id ? [x] : next ? [next] : []))); reload(); }} />
          ))}
        </div>
        {canVerdict && (
          <fieldset className="mt-3" disabled={busy}>
            <legend className="text-sm font-medium">Your review</legend>
            <div className="mt-1 grid gap-2 sm:grid-cols-3">
              {ACTIONS.map((a) => (
                <label key={a.value} className="flex cursor-pointer flex-col rounded-md border border-zinc-300 p-2 text-sm has-[:checked]:border-blue-500 has-[:checked]:ring-2 has-[:checked]:ring-blue-500/50 has-[:focus-visible]:ring-2 has-[:focus-visible]:ring-blue-500/50 dark:border-zinc-700">
                  <span className="flex items-center gap-2 font-medium">
                    <input type="radio" name="review-action" value={a.value} checked={action === a.value} onChange={() => setAction(a.value)} className="accent-blue-600" />
                    {a.label}
                  </span>
                  <span className="mt-1 text-xs text-fg-muted">{a.hint}</span>
                </label>
              ))}
            </div>
          </fieldset>
        )}
        <label htmlFor="review-summary" className="mt-3 block text-sm font-medium">Summary <span className="font-normal text-fg-muted">(optional)</span></label>
        <textarea id="review-summary" data-autofocus value={summary} onChange={(e) => setSummary(e.target.value)} rows={4} className="mt-1 w-full resize-y rounded-md border border-zinc-300 bg-white p-3 text-sm outline-none focus-visible:border-blue-500 focus-visible:ring-2 focus-visible:ring-blue-500/50 dark:border-zinc-700 dark:bg-zinc-900" />
        <div className="mt-4 flex justify-end gap-2">
          <Button disabled={busy} onClick={onCancel}>Cancel</Button>
          <Button
            variant="primary"
            disabled={busy}
            onClick={async () => {
              setBusy(true);
              try {
                await onConfirm(summary, canVerdict ? action : 'comment');
              } catch (e) {
                toast.error('Could not submit the review', { description: (e as Error).message });
              } finally {
                setBusy(false);
              }
            }}
          >
            {busy ? <Loader2 className="size-4 animate-spin motion-reduce:animate-pulse" /> : <Send className="size-4" />}{canVerdict ? chosen.submit : 'Submit review'}
          </Button>
        </div>
      </div>
    </div>
  );
}
