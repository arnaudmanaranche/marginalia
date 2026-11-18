import type { Finding, TourStop } from './api';

// A chapter the bot could not review stays a stop: nobody has read it yet.
export function stopsToRead(tour: TourStop[], findings: Finding[] | null = null): TourStop[] {
  const known = findings && new Set(findings.map((f) => f.id));
  const holds = (s: TourStop) => (known ? s.findingIds.some((id) => known.has(id)) : s.findingIds.length > 0);
  return tour.filter((s) => holds(s) || (s.threadIds?.length ?? 0) > 0 || s.unreviewed);
}
