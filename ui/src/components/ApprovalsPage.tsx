import { useCallback, useEffect, useRef, useState } from 'react';
import { Inbox } from 'lucide-react';
import { useQueryClient } from '@tanstack/react-query';
import { APPROVALS_KEY, useApprovals, useDismiss, type Proposal } from '../lib/approvalsApi';
import { keyOf, ordered, selection, step } from '../lib/inbox';
import { toast } from '../lib/toast';
import { InboxList } from './InboxList';
import { ProposalPane } from './ProposalPane';
import { Button } from './ui/Button';

// The approvals inbox (ADR 0006): every comment the factory proposes and nobody decided yet. The list
// on the left, by MR; the selected one in full on the right, to add (as is or edited), or dismiss;
// the next one comes up by itself. On a narrow screen the pane sits under the list.
export function ApprovalsPage({ proposals, canPost, error, onRetry, busyId, onDismiss, onOpen, reload }: {
  proposals: Proposal[] | null; canPost: boolean; error: string | null; onRetry: () => void;
  busyId: string | null; onDismiss: (p: Proposal) => void; onOpen: (slug: string) => void; reload: () => void;
}) {
  const list = proposals ? ordered(proposals) : [];
  const [selected, setSelected] = useState<string | null>(null);
  const previous = useRef<Proposal[]>([]);
  const current = selection(list, selected, previous.current);
  useEffect(() => { previous.current = list; });
  const move = useCallback((by: 1 | -1) => setSelected(step(list, current ? keyOf(current) : null, by)), [list, current]);
  return (
    <div className="mx-auto max-w-7xl px-6 py-8">
      <h1 className="text-3xl font-semibold tracking-tight">Approvals</h1>
      <p className="mt-1 text-fg-muted">
        {proposals && (proposals.length === 0 ? 'Nothing waits for a decision.' : `${proposals.length} proposed comment${proposals.length > 1 ? 's' : ''} wait for a decision.`)}
        {proposals && !canPost && ' Posting is off in this studio: you can read, copy and dismiss.'}
      </p>
      {error && !proposals ? (
        <div role="alert" className="mt-6 flex flex-wrap items-center gap-3 rounded-lg border border-line p-4 text-sm text-fg-muted">
          <span>The approvals could not be loaded ({error}).</span>
          <Button size="sm" onClick={onRetry}>Try again</Button>
        </div>
      ) : !proposals ? (
        <div aria-busy="true" aria-label="Loading the approvals" className="mt-6 h-64 animate-pulse rounded-xl border border-line motion-reduce:animate-none" />
      ) : !current ? (
        <div className="mt-16 flex flex-col items-center gap-2 text-fg-muted"><Inbox className="size-8" aria-hidden />Every proposed comment has been added or dismissed.</div>
      ) : (
        <div className="mt-6 grid items-start gap-6 lg:grid-cols-[minmax(0,22rem)_minmax(0,1fr)]">
          <nav aria-label="Proposed comments" className="lg:sticky lg:top-[calc(var(--chrome-h)+1rem)] lg:max-h-[calc(100vh-var(--chrome-h)-3rem)] lg:overflow-y-auto lg:pr-1">
            <InboxList proposals={list} selected={keyOf(current)} onSelect={setSelected} />
          </nav>
          <ProposalPane key={keyOf(current)} proposal={current} canPost={canPost} busy={busyId === keyOf(current)} onDismiss={() => onDismiss(current)} onMove={move} onOpen={onOpen} reload={reload} />
        </div>
      )}
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
