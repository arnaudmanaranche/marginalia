import { cn } from '../../lib/utils';

// A small labelled fact, in words: a critical path touched, a branch, a ticket. Sunken fill with a
// hairline ring; `mono` for identifiers (a branch, a ticket key), words otherwise. Tool names have
// their own ToolChip.
export function Chip({ children, mono = false, title, className }: { children: React.ReactNode; mono?: boolean; title?: string; className?: string }) {
  return (
    <span title={title} className={cn('inline-flex max-w-full items-center truncate rounded-md bg-sunken px-1.5 py-px text-xs leading-4 ring-1 ring-inset ring-line-strong', mono ? 'font-mono text-[11px] text-fg-muted' : 'text-zinc-900 dark:text-zinc-100', className)}>
      {children}
    </span>
  );
}
