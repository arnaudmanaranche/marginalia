import { useState } from 'react';
import { toast } from '../lib/toast';
import { ExternalLink, GitBranch, Loader2, Upload, Wrench } from 'lucide-react';
import { pushDoctorFix, startDoctorFix, type DoctorFix } from '../lib/api';
import { Badge } from './ui/Badge';
import { Button } from './ui/Button';

// The doctor's fix for a failure that belongs in Marginalia: prepared on a branch of its own with a
// test, checked by the bot, and pushed only on the person's word. Nothing reaches the running bot
// until that branch is reviewed and merged.
export function DoctorFixPanel({ slug, runId, fix, source }: { slug: string; runId: string; fix: DoctorFix | null; source: { available: boolean; why?: string } }) {
  const [busy, setBusy] = useState(false);
  const [confirming, setConfirming] = useState(false);
  const act = async (fn: () => Promise<void>, failed: string) => {
    setBusy(true);
    try {
      await fn();
    } catch (e) {
      toast.error(failed, { description: (e as Error).message });
    } finally {
      setBusy(false);
      setConfirming(false);
    }
  };
  const spinner = <Loader2 className="size-3.5 animate-spin motion-reduce:animate-pulse" />;
  const prepare = (label: string) => (
    <Button size="sm" variant="primary" disabled={busy} onClick={() => act(() => startDoctorFix(slug, runId), 'Could not start the fix')}>
      {busy ? spinner : <Wrench className="size-3.5" />}{label}
    </Button>
  );

  if (!source.available && fix?.state !== 'pushed') return <p className="text-xs text-fg-muted">{source.why}</p>;
  if (!fix) {
    return (
      <div className="flex flex-wrap items-center justify-between gap-2">
        <p className="text-xs text-fg-muted">The doctor can write this change and its test on a branch of Marginalia. You review it and push it yourself.</p>
        {prepare('Prepare the fix on a branch')}
      </div>
    );
  }
  if (fix.state === 'running') {
    return <p role="status" className="flex items-center gap-2 text-fg-muted">{spinner}Writing the fix and its test on a branch, then running the tests…</p>;
  }
  if (fix.state === 'failed' || fix.state === 'nothing') {
    return (
      <div className="flex flex-wrap items-center justify-between gap-2">
        <p className="text-sm text-fg-muted">{fix.state === 'failed' ? `The fix could not be prepared: ${fix.error}` : `The doctor changed nothing: ${fix.note ?? 'the diagnosis did not hold once it read the code.'}`}</p>
        {prepare('Try again')}
      </div>
    );
  }
  return (
    <div className="space-y-2">
      <p className="flex flex-wrap items-center gap-2">
        <GitBranch className="size-3.5 text-fg-muted" aria-hidden /><code className="text-xs">{fix.branch}</code>
        {fix.commit && <code className="text-xs text-fg-muted">{fix.commit.slice(0, 8)}</code>}
        <Badge tone={fix.testsPassed ? 'success' : 'danger'}>{fix.testsPassed ? 'Tests pass' : 'Tests fail'}</Badge>
        {fix.state === 'pushed' && <Badge tone="info">Pushed</Badge>}
      </p>
      {fix.note && <p className="text-sm text-fg-muted">{fix.note}</p>}
      {fix.diffStat && <pre className="max-h-40 overflow-auto rounded bg-canvas p-2 font-mono text-xs">{fix.diffStat}</pre>}
      {fix.state === 'pushed' ? (
        fix.url
          ? <a href={fix.url} target="_blank" rel="noreferrer" className="inline-flex items-center gap-1.5 text-sm text-blue-600 hover:underline dark:text-blue-400"><ExternalLink className="size-3.5" />Open a merge request for it</a>
          : <p className="text-sm text-fg-muted">Pushed: open a merge request from <code>{fix.branch}</code> to review and merge it.</p>
      ) : confirming ? (
        <div role="group" aria-label="Confirm the push" className="flex flex-wrap items-center gap-2 rounded-md border border-amber-500/40 bg-amber-500/5 p-2 text-sm">
          <span className="flex-1">Push <code>{fix.branch}</code> to Marginalia's origin?{!fix.testsPassed && ' Its tests fail.'}</span>
          <Button size="sm" disabled={busy} onClick={() => setConfirming(false)}>Cancel</Button>
          <Button size="sm" variant="primary" disabled={busy} onClick={() => act(() => pushDoctorFix(slug, runId), 'Could not push the branch')}>{busy ? spinner : <Upload className="size-3.5" />}Push</Button>
        </div>
      ) : (
        <div className="flex flex-wrap gap-2">
          <Button size="sm" variant="primary" disabled={busy} onClick={() => setConfirming(true)}><Upload className="size-3.5" />Push the branch</Button>
          {prepare('Prepare it again')}
        </div>
      )}
    </div>
  );
}
