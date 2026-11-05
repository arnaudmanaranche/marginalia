import type { ComponentProps } from 'react';
import { cn } from '../../lib/utils';

// The one text field: surface fill, strong hairline, the run ring on focus. A value that differs from
// its default can be marked (`changed`) with a run hairline, so a person sees what they moved.
export function Input({ className, changed = false, ...props }: ComponentProps<'input'> & { changed?: boolean }) {
  return (
    <input
      {...props}
      className={cn('touch-target w-full rounded-lg border bg-surface px-3 py-1.5 text-sm outline-none transition-colors duration-150 placeholder:text-fg-muted focus:border-run focus:ring-2 focus:ring-run/40', changed ? 'border-run/50' : 'border-line-strong', className)}
    />
  );
}
