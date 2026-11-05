import { duration } from '../../lib/runs';
import { useNow } from '../../lib/useNow';

// A duration that keeps counting while its thing goes on, in tabular figures so it does not jitter.
export function Elapsed({ from, to = null, className }: { from: string; to?: string | null; className?: string }) {
  const now = useNow(to === null);
  const end = to ? Date.parse(to) : now;
  return <span className={className ? `tabular-nums ${className}` : 'tabular-nums'}>{duration(end - Date.parse(from))}</span>;
}
