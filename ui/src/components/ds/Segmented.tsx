import { useId } from 'react';
import { m } from 'motion/react';
import { cn } from '../../lib/utils';
import { transition } from '../../lib/motion';

// One choice among a few, as a row of segments (a filter, a view). The chosen one sits on a raised
// thumb that slides from the last choice; each can carry a count. A radio group for assistive
// technology. With reduced motion the thumb jumps (MotionConfig drops layout travel).
export function Segmented<T extends string>({ options, value, onChange, label }: {
  options: { id: T; label: string; count?: number }[]; value: T; onChange: (id: T) => void; label: string;
}) {
  const thumb = `segmented-thumb-${useId()}`;
  return (
    <div role="radiogroup" aria-label={label} className="inline-flex flex-wrap gap-0.5 rounded-lg bg-sunken p-0.5 ring-1 ring-inset ring-line">
      {options.map((o) => {
        const on = o.id === value;
        return (
          <button
            key={o.id} type="button" role="radio" aria-checked={on} onClick={() => onChange(o.id)}
            className={cn('touch-target relative inline-flex items-center gap-1.5 rounded-md px-2.5 py-1 text-xs transition-colors duration-150', on ? 'font-medium text-zinc-900 dark:text-zinc-100' : 'text-fg-muted hover:text-zinc-900 dark:hover:text-zinc-100')}
          >
            {on && <m.span layoutId={thumb} aria-hidden transition={transition.base} className="absolute inset-0 rounded-md bg-surface ring-1 ring-line-strong" />}
            <span className="relative">{o.label}</span>
            {o.count != null && <span className="relative tabular-nums text-fg-muted">{o.count}</span>}
          </button>
        );
      })}
    </div>
  );
}
