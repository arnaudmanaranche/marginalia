import * as m from 'motion/react-m';
import type { ReviewItem } from '../lib/api';
import { standingOf } from '../lib/dashboard';
import { cn, timeAgo } from '../lib/utils';
import { Badge } from './ui/Badge';
import { RiskBadge } from './RiskBadge';
import { VerdictBadge } from './VerdictBadge';
import { LivePill } from './ds/LivePill';
import { SeverityDot } from './ds/Severity';
import { ChevronRight } from 'lucide-react';
import { EASE_OUT } from '../lib/motion';

// Where I stand on the MR, from GitLab (see standingOf), when it says more than the group the row
// sits in: "Review requested" is what "Needs your first review" means, "You commented" what
// "Waiting on others" means.
const SAID_BY_GROUP = new Set(['Review requested', 'You commented']);
function StandingBadge({ item }: { item: ReviewItem }) {
  const standing = item.myState ? standingOf(item.kind, item.myState) : null;
  return standing && !SAID_BY_GROUP.has(standing.label) ? <Badge tone={standing.tone}>{standing.label}</Badge> : null;
}

// One review per line: the title opens it; findings and age say how urgent it is.
// An MR the bot is reviewing, or just picked up and has no report for yet, opens on what the bot is
// doing. A row that `arrived` while the page was open slides in and glows for a moment; one that
// `changed` (a new report, queued, failed) glows the same way where it stands.
// `reason`: why it is in the feed's Needs-you list ("Returned to you"), said beside the title.
export function ReviewRow({ item, unread, reviewing = false, held = false, arrived = false, changed = false, showProject = false, reason }: { item: ReviewItem; unread: boolean; reviewing?: boolean; held?: boolean; arrived?: boolean; changed?: boolean; showProject?: boolean; reason?: string }) {
  const title = (
    <>
      {item.iid && <span className="mr-2 font-mono text-[11px] tabular-nums text-fg-muted">!{item.iid}</span>}
      {item.title}
      {unread && <span className="sr-only"> (unread)</span>}
    </>
  );
  return (
    <m.li
      layout="position"
      initial={arrived ? { opacity: 0, y: -12 } : false}
      animate={{ opacity: 1, y: 0 }}
      transition={{ duration: 0.35, ease: EASE_OUT }}
      className={cn(
        'group/row flex flex-wrap items-center gap-x-4 gap-y-1 px-4 py-2.5 text-sm transition-colors motion-reduce:transition-none',
        // The glow comes on at once and fades out slowly, so the eye catches it and then lets go.
        arrived || changed ? 'bg-run/20 duration-150' : 'bg-surface duration-1000',
        'hover:bg-sunken/40',
      )}
    >
      <span className={unread ? 'size-2 shrink-0 rounded-full bg-run' : 'size-2 shrink-0'} aria-hidden />
      <a href={`#/${item.slug}`} data-vt-title={item.slug} className="min-w-0 flex-1 basis-64 truncate font-medium hover:underline">{title}</a>
      {reason && <span className="shrink-0 text-xs text-fg-muted">{reason}</span>}
      {arrived && <Badge tone="info">New</Badge>}
      {reviewing && <LivePill tone="run" label="Reviewing" live title="Open it to follow the run" />}
      {/* Past the budget a queued MR waits for midnight: "Queued" would promise a run that is not coming. */}
      {!reviewing && item.awaiting === 'queued' && (held
        ? <LivePill tone="warn" label="Waits for tomorrow" title="Today's budget is spent. Open it and use Run again (↻) to run it now." />
        : <LivePill tone="idle" label="Queued" title="The bot reviews it in this poll: open it to follow the run" />)}
      {!reviewing && item.hold && <LivePill tone="idle" label="Not reviewed" title={item.hold} />}
      {!reviewing && item.awaiting === 'failed' && (item.failure?.transient
        ? <LivePill tone="warn" label="Retrying soon" title={`${item.failure.title}. It is tried again on its own in a few minutes.`} />
        : <LivePill tone="fail" label="Review failed" title={`${item.failure?.title ?? 'The first review failed'}: open it to see why. It is tried again on the next poll.`} />)}
      {showProject && <Badge tone="neutral" title="Project">{item.project}</Badge>}
      {(item.critical > 0 || item.important > 0) && (
        <span className="flex gap-3 text-xs tabular-nums text-fg-muted">
          {item.critical > 0 && <span className="inline-flex items-center gap-1.5" title={`${item.critical} critical`}><SeverityDot level="critical" />{item.critical}<span className="sr-only"> critical</span></span>}
          {item.important > 0 && <span className="inline-flex items-center gap-1.5" title={`${item.important} important`}><SeverityDot level="important" />{item.important}<span className="sr-only"> important</span></span>}
        </span>
      )}
      <StandingBadge item={item} />
      {/* Low risk is the quiet default: only a risk worth weighing is shown. */}
      {item.risk !== 'low' && <RiskBadge level={item.risk ?? null} />}
      {/* My own MR gets no verdict from me: I answer it, I do not review it. */}
      {item.kind !== 'comments' && <VerdictBadge verdict={item.verdict} />}
      <span className="flex w-24 shrink-0 items-center justify-end gap-1 whitespace-nowrap text-xs text-fg-muted">{timeAgo(item.reviewedAt)}<ChevronRight className="size-3.5 opacity-0 transition-opacity duration-150 group-hover/row:opacity-100" aria-hidden /></span>
    </m.li>
  );
}
