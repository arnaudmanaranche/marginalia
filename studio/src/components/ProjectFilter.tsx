import { cn } from '../lib/utils';
import type { FilterOption, ProjectFilter as Filter } from '../lib/projects';

// Narrows Home to one project or one side of the stack. A group of toggle buttons, so it is
// reachable by Tab and Space or Enter, and the current choice is announced.
export function ProjectFilter({ options, value, onChange }: { options: FilterOption[]; value: Filter; onChange: (value: Filter) => void }) {
  return (
    <div role="group" aria-label="Filter by project" className="mt-4 flex flex-wrap gap-1.5">
      {options.map((o) => {
        const on = o.value === value;
        return (
          <button
            key={o.value}
            type="button"
            aria-pressed={on}
            onClick={() => onChange(o.value)}
            className={cn(
              'touch-target rounded-full px-3 py-1 text-xs',
              on ? 'bg-zinc-900 font-medium text-white dark:bg-zinc-100 dark:text-zinc-900' : 'bg-zinc-500/10 text-fg-muted hover:bg-zinc-500/20',
            )}
          >
            {o.label}
          </button>
        );
      })}
    </div>
  );
}
