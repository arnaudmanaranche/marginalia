import type { ReviewItem } from '../lib/api';
import { recapRefreshKey, useRecap, type Recap } from '../lib/recapApi';
import { recapHeading } from '../lib/recapText';
import { recapLine } from '../lib/recapWords';

// The recap in one line, on the row of an MR that came back: "1 addressed · 1 contested · 2 new", the
// same words as the panel and the badges. Silent when there is nothing to say.
export function RecapLine({ recap }: { recap: Recap }) {
  const line = recapLine(recap.counts);
  return line ? <span className="shrink-0 text-xs text-fg-muted" title={recapHeading(recap.baseline)}>{line}</span> : null;
}

// Read only for a row that came back (see ReviewRow): one request when something changed, not per refresh.
export function RowRecap({ item }: { item: ReviewItem }) {
  const { recap } = useRecap(item.tracked ? item.slug : null, recapRefreshKey(item));
  return recap ? <RecapLine recap={recap} /> : null;
}
