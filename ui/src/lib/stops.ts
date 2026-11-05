import type { Finding, TourStop } from './api';

// The stops worth stopping at: those with something to act on or to know. A chapter with no
// finding and no thread is a part of the change the bot read and found nothing in: not a stop. A
// finding counts only if the review really holds it (a chapter naming a finding that is not there has
// nothing to show), and a chapter the bot could not review stays, since nobody has read it yet.
export function stopsToRead(tour: TourStop[], findings: Finding[] | null = null): TourStop[] {
  const known = findings && new Set(findings.map((f) => f.id));
  const holds = (s: TourStop) => (known ? s.findingIds.some((id) => known.has(id)) : s.findingIds.length > 0);
  return tour.filter((s) => holds(s) || (s.threadIds?.length ?? 0) > 0 || s.unreviewed);
}
