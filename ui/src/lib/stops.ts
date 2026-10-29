import type { TourStop } from './api';

// The stops worth stopping at: those with something to act on or to know. A chapter with no
// finding and no thread is a part of the change the bot read and found nothing in: not a stop.
// A chapter the bot could not review stays, since nobody has read it yet.
export function stopsToRead(tour: TourStop[]): TourStop[] {
  return tour.filter((s) => s.findingIds.length > 0 || (s.threadIds?.length ?? 0) > 0 || s.unreviewed);
}
