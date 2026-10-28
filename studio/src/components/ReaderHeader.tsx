import { ExternalLink, History, Loader2, RefreshCw, Send } from 'lucide-react';
import type { Risk, ReviewItem } from '../lib/api';
import { cn } from '../lib/utils';
import { RiskBadge } from './RiskBadge';
import { VerdictBadge } from './VerdictBadge';
import { Button } from './ui/Button';

// Title, verdict and the actions on a review. On my own MR there is no verdict to give: the
// action is sending my replies to the reviewers.
export function ReaderHeader({ item, risk, showSubmit, draftCount, sending, reviewing, onSubmit, locked, onRerun, runsOpen = false, onToggleRuns }: {
  item: ReviewItem | undefined;
  risk: Risk | null;
  showSubmit: boolean;
  draftCount: number;
  sending: boolean;
  // The bot is reviewing the MR: the findings behind the drafts are about to be replaced.
  reviewing: boolean;
  onSubmit: () => void;
  locked: boolean;
  onRerun: () => void;
  // The bot's runs on this MR: what it did, step by step. Absent when there is nothing to show.
  runsOpen?: boolean;
  onToggleRuns?: () => void;
}) {
  return (
    <div className="mb-4 flex shrink-0 flex-wrap items-start justify-between gap-3 lg:flex-nowrap">
      <div className="min-w-0 flex-1">
        <div className="flex min-w-0 items-center gap-x-3">
          <h1 title={item?.title} className="min-w-0 truncate text-2xl font-semibold tracking-tight">{item?.title ?? 'Review'}</h1>
          <span className="flex shrink-0 items-center gap-2">
            {item?.kind !== 'comments' && <VerdictBadge verdict={item?.verdict ?? null} />}
            <RiskBadge level={risk?.level ?? null} why={risk?.rationale} />
          </span>
        </div>
      </div>
      <div className="flex shrink-0 items-center gap-2">
        {showSubmit && (
          <Button variant="primary" disabled={sending || reviewing} title={sending ? 'Waiting for GitLab to confirm the comments being added' : reviewing ? 'Wait for the review in progress to finish' : undefined} onClick={onSubmit}>
            {sending ? <Loader2 className="size-3.5 animate-spin motion-reduce:animate-pulse" /> : <Send className="size-3.5" />}{item?.kind === 'comments' ? 'Send replies' : 'Submit review'}{draftCount > 0 ? ` (${draftCount})` : ''}
          </Button>
        )}
        {onToggleRuns && (
          <Button onClick={onToggleRuns} aria-pressed={runsOpen} aria-label="What the bot did" title="What the bot did on this MR, run by run" className="px-2.5">
            <History className="size-4" />
          </Button>
        )}
        {item?.tracked && item.kind !== 'retro' && (
          <Button disabled={locked} onClick={onRerun} aria-label={item.kind === 'comments' ? 'Re-run triage' : 'Re-run review'} title={item.kind === 'comments' ? 'Triage the reviewer comments again on the current head of the MR' : 'Run the review again on the current head of the MR'} className="px-2.5">
            {locked ? <Loader2 className="size-4 animate-spin motion-reduce:animate-pulse" /> : <RefreshCw className="size-4" />}
          </Button>
        )}
        {item?.webUrl && (
          <a href={item.webUrl} target="_blank" rel="noreferrer" aria-label="Open in GitLab" title="Open in GitLab" className="touch-target inline-flex items-center justify-center rounded-lg border border-zinc-200 bg-white px-2.5 py-1.5 text-sm hover:bg-zinc-50 dark:border-zinc-800 dark:bg-zinc-900 dark:hover:bg-zinc-800">
            <ExternalLink className="size-4" />
          </a>
        )}
      </div>
    </div>
  );
}
