import { ExternalLink, RefreshCw, Send } from 'lucide-react';
import type { Risk, ReviewItem } from '../lib/api';
import { cn } from '../lib/utils';
import { RiskBadge } from './RiskBadge';
import { VerdictBadge } from './VerdictBadge';
import { Button } from './ui/Button';
import { Spinner } from './ds/Spinner';

// Title, verdict and the actions on a review. On my own MR there is no verdict to give: the
// action is sending my replies to the reviewers.
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
  locked: boolean;
  onRerun: () => void;
}) {
  return (
    <div className="mb-4 flex shrink-0 flex-wrap items-start justify-between gap-3 lg:flex-nowrap">
      <div className="min-w-0 flex-1">
        {/* Never squeezed away: the title wraps (two lines at most) and the badges go under it. */}
        <div className="flex min-w-0 flex-wrap items-center gap-x-3 gap-y-1.5">
          <h1 title={item?.title} className="line-clamp-2 min-w-0 break-words text-2xl font-semibold tracking-tight [text-wrap:balance] lg:line-clamp-1">{item?.title ?? 'Review'}</h1>
          <span className="flex shrink-0 items-center gap-2">
            {item?.kind !== 'comments' && <VerdictBadge verdict={item?.verdict ?? null} />}
            <RiskBadge level={risk?.level ?? null} why={risk?.rationale} />
          </span>
        </div>
        {criticalPaths.length > 0 && (
          <p className="mt-1 truncate text-sm text-fg-muted" title={criticalPaths.join(', ')}>Touches {criticalPaths.length > 1 ? 'critical paths' : 'a critical path'}: {criticalPaths.join(', ')}</p>
        )}
        {item?.kind === 'own' && <p className="mt-1 text-sm text-fg-muted">Your own work, reviewed for you. Nothing here is posted.</p>}
      </div>
      <div className="flex shrink-0 items-center gap-2">
        {showSubmit && (
          <Button variant="primary" disabled={sending || reviewing} title={sending ? 'Waiting for GitLab to confirm the comments being added' : reviewing ? 'Wait for the review in progress to finish' : undefined} onClick={onSubmit}>
            {sending ? <Spinner className="size-3.5" /> : <Send className="size-3.5" />}{item?.kind === 'comments' ? 'Send replies' : 'Submit review'}{draftCount > 0 ? ` (${draftCount})` : ''}
          </Button>
        )}
        {item?.tracked && item.kind !== 'retro' && (
          <Button disabled={locked} onClick={onRerun} aria-label={item.kind === 'comments' ? 'Re-run triage' : 'Re-run review'} title={item.kind === 'comments' ? 'Triage the reviewer comments again on the current head of the MR' : item.kind === 'own' ? 'Review your work again on its current head' : 'Run the review again on the current head of the MR'} className="px-2.5">
            {locked ? <Spinner className="size-4" /> : <RefreshCw className="size-4" />}
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
