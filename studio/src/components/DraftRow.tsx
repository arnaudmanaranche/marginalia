import { useState } from 'react';
import { toast } from '../lib/toast';
import { Check, Pencil, Trash2, X } from 'lucide-react';
import type { DraftNote } from '../lib/api';
import { useDraftMutations } from '../lib/useDrafts';
import { Button } from './ui/Button';
import { NoteMarkdown } from './NoteMarkdown';

// One pending draft: read, edit in place, or delete. Goes straight to GitLab's draft notes.
export function DraftRow({ slug, draft, disabled, onChanged }: { slug: string; draft: DraftNote; disabled: boolean; onChanged: () => void }) {
  const [editing, setEditing] = useState(false);
  const [text, setText] = useState(draft.body);
  const { update, remove } = useDraftMutations(slug, onChanged);
  const busy = update.isPending || remove.isPending;
  const fail = (failure: string) => (e: Error) => toast.error(failure, { description: e.message });
  return (
    <div className="rounded-lg border border-line bg-canvas p-2.5 text-sm">
      <div className="flex items-center justify-between gap-2">
        <code className="min-w-0 break-all text-xs text-fg-muted">{draft.path ? `${draft.path}${draft.line ? `:${draft.line}` : ''}` : 'General comment'}</code>
        <span className="flex shrink-0 items-center gap-1">
          {editing ? (
            <>
              <Button size="sm" variant="ghost" disabled={busy || disabled || !text.trim()} onClick={() => update.mutate({ draft, body: text.trim() }, { onSuccess: () => setEditing(false), onError: fail('Could not update the draft') })}>
                <Check className="size-3.5" />Save
              </Button>
              <Button size="sm" variant="ghost" disabled={busy} onClick={() => { setText(draft.body); setEditing(false); }}>
                <X className="size-3.5" />Cancel
              </Button>
            </>
          ) : (
            <>
              <Button size="sm" variant="ghost" disabled={busy || disabled} onClick={() => setEditing(true)} aria-label="Edit this draft"><Pencil className="size-3.5" />Edit</Button>
              <Button size="sm" variant="danger" disabled={busy || disabled} onClick={() => remove.mutate(draft, { onError: fail('Could not delete the draft') })} aria-label="Delete this draft">
                <Trash2 className="size-3.5" />Delete
              </Button>
            </>
          )}
        </span>
      </div>
      {editing ? (
        <textarea value={text} onChange={(e) => setText(e.target.value)} rows={Math.min(10, Math.max(3, text.split('\n').length + 1))} aria-label="Draft text" className="mt-2 w-full resize-y rounded-md border border-line-strong bg-surface p-2 text-sm outline-none focus-visible:border-blue-500 focus-visible:ring-2 focus-visible:ring-blue-500/50" />
      ) : (
        <NoteMarkdown className="mt-1">{draft.body}</NoteMarkdown>
      )}
    </div>
  );
}
