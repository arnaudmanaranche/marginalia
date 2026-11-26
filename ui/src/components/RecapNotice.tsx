import { Button } from './ui/Button';

// What stands in for the recap while it is read, and when it cannot be: a failure is said, never left
// looking like "nothing changed".
export function RecapNotice({ loading, error, retry }: { loading: boolean; error: string | null; retry: () => void }) {
  if (error) {
    return (
      <div role="alert" className="mb-4 flex shrink-0 flex-wrap items-center gap-3 rounded-xl border border-line px-4 py-2.5 text-xs text-fg-muted">
        <span>What changed since the baseline could not be read ({error}).</span>
        <Button size="sm" onClick={retry}>Try again</Button>
      </div>
    );
  }
  if (loading) return <div aria-hidden className="mb-4 h-[42px] shrink-0 animate-pulse rounded-xl border border-line motion-reduce:animate-none" />;
  return null;
}
