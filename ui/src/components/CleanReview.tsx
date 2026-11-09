import { useState } from 'react';
import { CheckCircle2 } from 'lucide-react';
import type { TourStop } from '../lib/api';
import { CollapsibleCard } from './CollapsibleCard';

// A review that found nothing to act on: the header already says what changed and how risky it is,
// so this says only that, and keeps the chapters the bot read one click away.
export function CleanReview({ chapters }: { chapters: TourStop[] }) {
  const [open, setOpen] = useState(false);
  return (
    <div className="mx-auto w-full max-w-[80ch] space-y-3">
      <p className="flex items-center gap-2 px-1 text-sm text-fg-muted">
        <CheckCircle2 className="size-4 text-emerald-500" aria-hidden />
        Nothing to comment on. The bot read {chapters.length === 1 ? 'the one chapter' : `all ${chapters.length} chapters`} and found nothing to raise.
      </p>
      <CollapsibleCard id="chapters" title={`What it read (${chapters.length})`} open={open} onOpenChange={setOpen}>
        <ol className="space-y-4 text-sm">
          {chapters.map((c, i) => (
            <li key={c.id}>
              <p className="font-medium">{i + 1}. {c.title}</p>
              {c.summary && <p className="mt-1 text-fg-muted">{c.summary}</p>}
              {c.files.length > 0 && <p className="mt-1 break-all font-mono text-xs text-fg-subtle">{c.files.join(' · ')}</p>}
            </li>
          ))}
        </ol>
      </CollapsibleCard>
    </div>
  );
}
