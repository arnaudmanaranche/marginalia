import { ExternalLink, Inbox } from 'lucide-react';
import { useQueryClient } from '@tanstack/react-query';
import { APPROVALS_KEY, byMergeRequest, useApprovals, useDismiss, type Proposal } from '../lib/approvalsApi';
import { toast } from '../lib/toast';
import { ProposalCard } from './ProposalCard';
import { Button } from './ui/Button';

// Every comment the factory proposes and nobody decided yet, grouped by MR (ADR 0006). A person
// adds each to the pending review, edited or not, or dismisses it; the review is then submitted
// from its page, as always.
export function ApprovalsPage({ proposals, canPost, error, onRetry, busyId, onDismiss, onOpen, reload }: {
  proposals: Proposal[] | null; canPost: boolean; error: string | null; onRetry: () => void;
  busyId: string | null; onDismiss: (p: Proposal) => void; onOpen: (slug: string) => void; reload: () => void;
}) {
  return (
    <div className="mx-auto max-w-5xl px-6 py-8">
      <h1 className="text-3xl font-semibold tracking-tight">Approvals</h1>
      <p className="mt-1 text-fg-muted">
        {proposals && (proposals.length === 0 ? 'Nothing waits for a decision.' : `${proposals.length} proposed comment${proposals.length > 1 ? 's' : ''} wait for a decision.`)}
        {proposals && !canPost && ' Posting is off in this studio: you can read and dismiss.'}
      </p>
      {error && !proposals ? (
        <div role="alert" className="mt-6 flex flex-wrap items-center gap-3 rounded-lg border border-line p-4 text-sm text-fg-muted">
          <span>The approvals could not be loaded ({error}).</span>
          <Button size="sm" onClick={onRetry}>Try again</Button>
        </div>
      ) : !proposals ? (
        <div aria-busy="true" aria-label="Loading the approvals" className="mt-6 h-40 animate-pulse rounded-xl border border-line motion-reduce:animate-none" />
      ) : proposals.length === 0 ? (
        <div className="mt-16 flex flex-col items-center gap-2 text-fg-muted"><Inbox className="size-8" aria-hidden />Every proposed comment has been added or dismissed.</div>
      ) : byMergeRequest(proposals).map((group) => {
        const first = group[0];
        return (
          <section key={first.slug} aria-label={first.mrTitle} className="mt-6">
            <div className="flex flex-wrap items-baseline justify-between gap-2">
              <h2 className="min-w-0 text-base font-medium">
                <button type="button" onClick={() => onOpen(first.slug)} className="text-left hover:underline">{first.mrTitle}</button>
                <span className="ml-2 text-sm font-normal text-fg-muted">!{first.iid}{first.criticalPaths.length > 0 && ` · touches ${first.criticalPaths.join(', ')}`}</span>
              </h2>
              {first.webUrl && <a href={first.webUrl} target="_blank" rel="noreferrer" className="inline-flex items-center gap-1 text-xs text-fg-muted hover:text-fg"><ExternalLink className="size-3.5" aria-hidden />GitLab</a>}
            </div>
            <ul className="mt-2 divide-y divide-line rounded-xl border border-line bg-surface">
              {group.map((p) => <ProposalCard key={p.findingId} proposal={p} canPost={canPost} busy={busyId === `${p.slug}:${p.findingId}`} onDismiss={() => onDismiss(p)} reload={reload} />)}
            </ul>
          </section>
        );
      })}
    </div>
  );
}

// The page with its data. A dismissal can be undone from its toast.
export function ApprovalsView({ onOpen }: { onOpen: (slug: string) => void }) {
  const { data, error, retry } = useApprovals();
  const dismiss = useDismiss();
  const client = useQueryClient();
  const reload = () => void client.invalidateQueries({ queryKey: APPROVALS_KEY });
  const onDismiss = (p: Proposal) => dismiss.mutate({ slug: p.slug, commentId: p.findingId }, {
    onSuccess: () => toast.success('Dismissed: nothing was sent', { action: { label: 'Undo', onClick: () => dismiss.mutate({ slug: p.slug, commentId: p.findingId, undo: true }) } }),
    onError: (err) => toast.error(`Could not dismiss: ${err.message}`),
  });
  const busy = dismiss.isPending && dismiss.variables ? `${dismiss.variables.slug}:${dismiss.variables.commentId}` : null;
  return <ApprovalsPage proposals={data?.proposals ?? null} canPost={data?.canPost ?? false} error={error} onRetry={retry} busyId={busy} onDismiss={onDismiss} onOpen={onOpen} reload={reload} />;
}
