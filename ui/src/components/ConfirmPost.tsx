import { useEffect, useEffectEvent, useRef, type RefObject } from 'react';
import { Send } from 'lucide-react';
import { useScrollLock } from '../lib/useScrollLock';
import { useModalFocus } from '../lib/useModalFocus';
import { Button } from './ui/Button';

// Nothing is sent until "Add to review" is clicked here, with the final text. The dialog closes at once:
// the comment shows as being added, and a toast says how it went.
export function ConfirmPost({ iid, text, target, onCancel, onConfirm, fallbackRef }: { iid: string | number; text: string; target: { path: string; line?: number } | null; onCancel: () => void; onConfirm: () => void; fallbackRef: RefObject<HTMLElement | null> }) {
  const dialogRef = useRef<HTMLDivElement>(null);
  useScrollLock(true);
  // Focus moves to Cancel (the safe choice), stays inside, and returns to the opener on close.
  useModalFocus(true, dialogRef, { initial: '[data-autofocus]', fallback: fallbackRef });
  // Always sees the latest onCancel, without re-subscribing every time the parent redraws.
  const onKey = useEffectEvent((e: KeyboardEvent) => e.key === 'Escape' && onCancel());
  useEffect(() => {
    document.addEventListener('keydown', onKey);
    return () => document.removeEventListener('keydown', onKey);
  }, []);
  return (
    <div role="presentation" className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 px-4" onClick={onCancel}>
      <div ref={dialogRef} role="dialog" aria-modal="true" aria-labelledby="confirm-post-title" aria-describedby="confirm-post-text" className="w-full max-w-lg rounded-xl border border-line bg-surface p-5 shadow-2xl" onClick={(e) => e.stopPropagation()}>
        <h2 id="confirm-post-title" className="text-base font-semibold">Add this comment to your review of !{iid}?</h2>
        <p className="mt-1 text-sm text-fg-muted">It joins your pending GitLab review: nobody sees it until you submit the review.</p>
        <p className="mt-1 text-sm text-fg-muted">
          {target ? <>Anchored on <code className="rounded bg-sunken px-1 py-0.5 text-[0.85em] [overflow-wrap:anywhere]">{target.path}{target.line ? `:${target.line}` : ''}</code> in the diff{target.line ? '' : ' (whole file)'}.</> : 'No file found above it: it will be a general comment.'}
        </p>
        <pre id="confirm-post-text" tabIndex={0} aria-label="Comment text" className="mt-3 max-h-64 overflow-y-auto whitespace-pre-wrap rounded-lg border border-line bg-canvas p-3 text-sm">{text}</pre>
        <div className="mt-4 flex justify-end gap-2">
          <Button data-autofocus onClick={onCancel}>Cancel</Button>
          <Button variant="primary" onClick={onConfirm}>
            <Send className="size-4" />Add to review
          </Button>
        </div>
      </div>
    </div>
  );
}
