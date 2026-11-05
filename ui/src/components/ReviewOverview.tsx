import { ArrowRight } from 'lucide-react';
import type { Overview } from '../lib/api';

// The change at a glance, before and after, in plain words: the first thing to read. One panel
// split by a hairline; the arrow and the ok dot say which way the change went.
export function ReviewOverview({ overview }: { overview: Overview }) {
  return (
    <section aria-label="Before and after" className="mb-4 grid shrink-0 overflow-hidden rounded-xl border border-line bg-surface md:grid-cols-[1fr_auto_1fr]">
      <div className="p-4">
        <h2 className="flex items-center gap-1.5 text-xs font-medium text-fg-muted"><span aria-hidden className="size-1.5 rounded-full bg-idle" />Before</h2>
        <p className="mt-1.5 text-sm leading-relaxed text-fg-muted">{overview.before}</p>
      </div>
      <span className="hidden items-center border-x border-line px-2 md:flex" aria-hidden><ArrowRight className="size-4 text-fg-subtle" /></span>
      <div className="border-t border-line p-4 md:border-t-0">
        <h2 className="flex items-center gap-1.5 text-xs font-medium"><span aria-hidden className="size-1.5 rounded-full bg-ok" />After</h2>
        <p className="mt-1.5 text-sm leading-relaxed">{overview.after}</p>
      </div>
    </section>
  );
}
