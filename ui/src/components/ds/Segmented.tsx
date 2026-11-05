import { cn } from '../../lib/utils';

// One choice among a few, as a row of segments (a filter, a view). The chosen one sits raised on
// the surface; each can carry a count. A radio group for assistive technology.
export function Segmented<T extends string>({ options, value, onChange, label }: {
  options: { id: T; label: string; count?: number }[]; value: T; onChange: (id: T) => void; label: string;
}) {
  return (
    <div role="radiogroup" aria-label={label} className="inline-flex flex-wrap gap-0.5 rounded-lg bg-sunken p-0.5 ring-1 ring-inset ring-line">
      {options.map((o) => {
        const on = o.id === value;
        return (
          <button
            key={o.id} type="button" role="radio" aria-checked={on} onClick={() => onChange(o.id)}
            className={cn('touch-target inline-flex items-center gap-1.5 rounded-md px-2.5 py-1 text-xs transition-colors duration-150', on ? 'bg-surface font-medium text-zinc-900 ring-1 ring-line-strong dark:text-zinc-100' : 'text-fg-muted hover:text-zinc-900 dark:hover:text-zinc-100')}
          >
            {o.label}
            {o.count != null && <span className="tabular-nums text-fg-muted">{o.count}</span>}
          </button>
        );
      })}
    </div>
  );
}
