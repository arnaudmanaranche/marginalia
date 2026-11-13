import { useContext } from 'react';
import { ExternalLink, RefreshCw, Send } from 'lucide-react';
import type { Risk, ReviewItem } from '../lib/api';
import { cn, timeAgo } from '../lib/utils';
import { RiskBadge } from './RiskBadge';
import { VerdictBadge } from './VerdictBadge';
import { Button } from './ui/Button';
import { Chip } from './ds/Chip';
import { Spinner } from './ds/Spinner';
import { LinkContext, Linked } from '../lib/links';
import { ticketUrl } from '../lib/tickets';
import { criticalPathRoute } from '../lib/hashRoute';

// Title, verdict and the actions on a review. On my own MR there is no verdict to give: the
// action is sending my replies to the reviewers.
// The MR's ticket, opening its page on the tracker when one is set.
function TicketChip({ ticket }: { ticket: { key: string; priority: string | null } }) {
  const url = ticketUrl(useContext(LinkContext).tickets ?? null, ticket.key);
  const chip = <Chip mono title={`${ticket.priority ? `Ticket, priority ${ticket.priority}` : 'Ticket'}${url ? ', open it' : ''}`} className={url ? 'hover:ring-fg-subtle' : undefined}>{ticket.key}</Chip>;
  return url ? <a href={url} target="_blank" rel="noreferrer">{chip}</a> : chip;
}

export function ReaderHeader({ item, risk, criticalPaths = [], showSubmit, draftCount, sending, reviewing, onSubmit, locked, onRerun }: {
  item: ReviewItem | undefined;
  risk: Risk | null;
  // The project's critical paths the MR touches: said once, quietly, under the title.
  criticalPaths?: string[];
  showSubmit: boolean;
  draftCount: number;
  sending: boolean;
  // The bot is reviewing the MR: the findings behind the drafts are about to be replaced.
  reviewing: boolean;
  onSubmit: () => void;
  // Re-run is refused: a run is going (`reviewing`) or an earlier version is on screen.
  locked: boolean;
  onRerun: () => void;
}) {
  return (
    <div className="mb-4 flex shrink-0 flex-wrap items-start justify-between gap-3 lg:flex-nowrap">
      <div className="min-w-0 flex-1">
        {/* Never squeezed away: the title wraps (two lines at most) and the badges go under it. */}
        <div className="flex min-w-0 flex-wrap items-center gap-x-3 gap-y-1.5">
          <h1 title={item?.title} data-vt-title={item?.slug} className="line-clamp-2 min-w-0 break-words text-2xl font-semibold tracking-tight [text-wrap:balance] lg:line-clamp-1">{item?.title ? <Linked text={item.title} /> : 'Review'}</h1>
          <span className="flex shrink-0 items-center gap-2">
            {item?.kind !== 'comments' && <VerdictBadge verdict={item?.verdict ?? null} />}
            <RiskBadge level={risk?.level ?? null} why={risk?.rationale} />
          </span>
        </div>
        {item && (
          <p className="mt-1.5 flex flex-wrap items-center gap-x-2 gap-y-1 text-xs text-fg-muted">
            {item.iid != null && <span className="font-mono tabular-nums">!{item.iid}</span>}
            {item.author && <span>@{item.author}</span>}
            {item.branch && <Chip mono title="Source branch">{item.branch}</Chip>}
            {item.jira && <TicketChip ticket={item.jira} />}
            <span title={new Date(item.reviewedAt).toLocaleString()}>reviewed {timeAgo(item.reviewedAt)}</span>
          </p>
        )}
        {criticalPaths.length > 0 && (
          <p className="mt-1.5 flex flex-wrap items-center gap-1.5 text-xs text-fg-muted">
            <span>Touches</span>
            {/* Each opens the project context on that path: what it is, where it lives, what breaks. */}
            {criticalPaths.map((p) => item ? (
              <a key={p} href={`#/${criticalPathRoute(item.project, p)}`} title="See this critical path in the project context" className="rounded-md hover:[&>span]:ring-fg-subtle"><Chip>{p}</Chip></a>
            ) : <Chip key={p}>{p}</Chip>)}
          </p>
        )}
        {item?.kind === 'own' && <p className="mt-1 text-sm text-fg-muted">Your own work, reviewed for you. Nothing here is posted.</p>}
      </div>
      <div className="flex shrink-0 items-center gap-2">
        {showSubmit && (
          <Button variant="primary" disabled={sending || reviewing} title={sending ? 'Waiting for GitLab to confirm the comments being added' : reviewing ? 'Wait for the review in progress to finish' : undefined} onClick={onSubmit}>
            {sending ? <Spinner className="size-3.5" /> : <Send className="size-3.5" />}{item?.kind === 'comments' ? 'Send replies' : 'Submit review'}{draftCount > 0 ? ` (${draftCount})` : ''}
          </Button>
        )}
        {/* Busy only while a run is going; locked for another reason (an earlier version on screen), it says why. */}
        {item?.tracked && item.kind !== 'retro' && (
          <Button disabled={locked} onClick={onRerun} aria-label={item.kind === 'comments' ? 'Re-run triage' : 'Re-run review'} title={reviewing ? 'A run is in progress' : locked ? 'Go back to the latest version to run it again' : item.kind === 'comments' ? 'Triage the reviewer comments again on the current head of the MR' : item.kind === 'own' ? 'Review your work again on its current head' : 'Run the review again on the current head of the MR'} className="px-2.5">
            {reviewing ? <Spinner className="size-4" /> : <RefreshCw className="size-4" />}
          </Button>
        )}
        {item?.webUrl && (
          <a href={item.webUrl} target="_blank" rel="noreferrer" aria-label="Open in GitLab" title="Open in GitLab" className="touch-target inline-flex items-center justify-center rounded-lg border border-line bg-surface px-2.5 py-1.5 text-sm hover:bg-zinc-50 dark:hover:bg-zinc-800">
            <ExternalLink className="size-4" />
          </a>
        )}
      </div>
    </div>
  );
}
