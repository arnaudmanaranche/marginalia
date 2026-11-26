import { useState } from 'react';
import { ChevronDown } from 'lucide-react';
import type { Recap } from '../lib/recapApi';
import { isQuiet, mrSentence, recapHeading } from '../lib/recapText';
import { recapParts } from '../lib/recapWords';
import { cn } from '../lib/utils';
import { Badge } from './ui/Badge';
import { RecapComments } from './RecapComments';
import { RecapFindings } from './RecapFindings';

// What changed on a re-reviewed MR since its baseline (GLOSSARY: Recap), at a glance: what happened to
// the MR, where each of my comments stands, what is new. Open by default: it is why I came back.
export function RecapPanel({ recap }: { recap: Recap }) {
  const [open, setOpen] = useState(true);
  const quiet = isQuiet(recap);
  const summary = (
    <>
      <span className="text-fg-muted">{recapHeading(recap.baseline)}</span>
      {recapParts(recap.counts).map((p) => <Badge key={p.key} tone={p.tone}>{p.count} {p.label}</Badge>)}
    </>
  );
  return (
    <section aria-label="Since the baseline" className="mb-4 shrink-0 rounded-xl border border-line bg-surface text-xs">
      <div className="px-4 py-2.5">
        {quiet ? <div className="flex flex-wrap items-center gap-2">{summary}</div> : (
          <button aria-expanded={open} onClick={() => setOpen(!open)} className="flex min-w-0 flex-wrap items-center gap-2 text-left">
            {summary}
            <ChevronDown className={cn('size-3.5 shrink-0 text-fg-muted transition-transform motion-reduce:transition-none', !open && '-rotate-90')} aria-hidden />
          </button>
        )}
        <p className="mt-1 text-fg-muted">{mrSentence(recap.mr)}</p>
      </div>
      {open && !quiet && (
        <div className="space-y-3 border-t border-line px-4 py-3">
          {recap.comments.length > 0 && (
            <div>
              <h3 className="mb-1 font-medium">Your comments</h3>
              <RecapComments comments={recap.comments} />
            </div>
          )}
          <RecapFindings recap={recap} />
        </div>
      )}
    </section>
  );
}
