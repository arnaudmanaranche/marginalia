import { ChevronRight } from 'lucide-react';

// A line of the feed that is not a review: a mark, what needs doing, why, and where a click leads.
// Same rhythm as a review row so the Needs-you list reads as one list.
export function FeedRow({ mark, title, detail, onOpen }: { mark: React.ReactNode; title: React.ReactNode; detail?: React.ReactNode; onOpen: () => void }) {
  return (
    <li>
      <button type="button" onClick={onOpen} className="group/row touch-target flex w-full items-center gap-4 bg-surface px-4 py-2.5 text-left text-sm transition-colors duration-150 hover:bg-sunken/40">
        <span className="flex size-4 shrink-0 items-center justify-center">{mark}</span>
        <span className="min-w-0 flex-1">
          <span className="block truncate font-medium">{title}</span>
          {detail && <span className="block truncate text-xs text-fg-muted">{detail}</span>}
        </span>
        <ChevronRight className="size-3.5 shrink-0 text-fg-subtle opacity-0 transition-opacity duration-150 group-hover/row:opacity-100" aria-hidden />
      </button>
    </li>
  );
}
