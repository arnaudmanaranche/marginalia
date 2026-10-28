import * as m from 'motion/react-m';
import type { ReviewItem } from '../lib/api';
import { standingOf } from '../lib/dashboard';
import { cn, timeAgo } from '../lib/utils';
import { Badge } from './ui/Badge';
import { RiskBadge } from './RiskBadge';
import { VerdictBadge } from './VerdictBadge';

// Where I stand on the MR, from GitLab (see standingOf).
function StandingBadge({ item }: { item: ReviewItem }) {
  const standing = item.myState ? standingOf(item.kind, item.myState) : null;
  return standing ? <Badge tone={standing.tone}>{standing.label}</Badge> : null;
}

// One review per line: the title opens it; findings and age say how urgent it is.
// An MR the bot is reviewing, or just picked up and has no report for yet, opens on what the bot is
// doing. A row that `arrived` while the page was open slides in and glows for a moment.
export function ReviewRow({ item, unread, reviewing = false, arrived = false, showProject = false }: { item: ReviewItem; unread: boolean; reviewing?: boolean; arrived?: boolean; showProject?: boolean }) {
  const title = (
    <>
      {item.iid && <span className="mr-2 font-mono text-xs text-fg-muted">!{item.iid}</span>}
      {item.title}
      {unread && <span className="sr-only"> (unread)</span>}
    </>
  );
  return (
    <m.li
      layout="position"
      initial={arrived ? { opacity: 0, y: -12 } : false}
      animate={{ opacity: 1, y: 0 }}
      transition={{ duration: 0.35, ease: [0.22, 1, 0.36, 1] }}
      className={cn(
        'flex flex-wrap items-center gap-x-4 gap-y-1 px-4 py-3 text-sm transition-colors duration-1000 motion-reduce:transition-none',
        arrived ? 'bg-blue-50 dark:bg-blue-950/50' : 'bg-white dark:bg-zinc-900',
        'hover:bg-zinc-50 dark:hover:bg-zinc-800/60',
      )}
    >
      <span className={unread ? 'size-2 shrink-0 rounded-full bg-blue-500' : 'size-2 shrink-0'} aria-hidden />
      <a href={`#/${item.slug}`} className="min-w-0 flex-1 basis-64 truncate font-medium hover:underline">{title}</a>
      {arrived && <Badge tone="info">New</Badge>}
      {reviewing && <Badge tone="info" className="animate-pulse motion-reduce:animate-none">Reviewing…</Badge>}
      {!reviewing && item.awaiting === 'queued' && <Badge tone="neutral" title="The bot reviews it in this poll: open it to follow the run">Queued</Badge>}
      {!reviewing && item.awaiting === 'failed' && (item.failure?.transient
        ? <Badge tone="warning" title={`${item.failure.title}. It is tried again on its own in a few minutes.`}>Retrying soon</Badge>
        : <Badge tone="danger" title={`${item.failure?.title ?? 'The first review failed'}: open it to see why. It is tried again on the next poll.`}>Review failed</Badge>)}
      {showProject && <Badge tone="neutral" title="Project">{item.project}</Badge>}
      {(item.critical > 0 || item.important > 0) && (
        <span className="flex gap-2 text-xs tabular-nums">
          {item.critical > 0 && <span className="text-red-700 dark:text-red-300">{item.critical} critical</span>}
          {item.important > 0 && <span className="text-amber-700 dark:text-amber-300">{item.important} important</span>}
        </span>
      )}
      <StandingBadge item={item} />
      <RiskBadge level={item.risk ?? null} />
      {/* My own MR gets no verdict from me: I answer it, I do not review it. */}
      {item.kind !== 'comments' && <VerdictBadge verdict={item.verdict} />}
      <span className="w-20 shrink-0 whitespace-nowrap text-right text-xs text-fg-muted">{timeAgo(item.reviewedAt)}</span>
    </m.li>
  );
}
