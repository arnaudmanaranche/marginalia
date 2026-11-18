import { useState } from 'react';
import { Upload } from 'lucide-react';
import { pushFixes, type FixesStatus } from '../lib/api';
import { pendingFix } from '../lib/replies';
import { toast } from '../lib/toast';
import { Button } from './ui/Button';
import { Spinner } from './ds/Spinner';

export const shortSha = (sha: string | null) => sha?.slice(0, 8) ?? '';

// The fix of one thread, not on the MR yet: pushed from here alone, after a second click that says
// where it goes. The merge settling the conflicts goes first, from "Fixes to push": the fixes were
// made on top of it.
export function PushOne({ slug, threadId, fixes, locked, onFixes }: { slug: string; threadId: string; fixes: FixesStatus | null; locked: boolean; onFixes: (fixes: FixesStatus) => void }) {
  const [confirming, setConfirming] = useState(false);
  const [busy, setBusy] = useState(false);
  const fix = pendingFix(threadId, fixes);
  if (!fix || !fixes) return <p className="text-xs text-fg-muted">Push the fixes first: this reply names the commit that fixed it.</p>;
  const oldest = fixes.commits[fixes.commits.length - 1];
  const mergeFirst = oldest?.merge && oldest.sha !== fix.sha;
  if (mergeFirst) return <p className="text-xs text-fg-muted">Its fix <code>{shortSha(fix.sha)}</code> was made on top of the merge that settles the conflicts: push that one first, under Fixes to push.</p>;

  const push = async () => {
    setBusy(true);
    try {
      const after = await pushFixes(slug, fix.sha);
      onFixes(after);
      toast.success(`Fix pushed to ${fixes.branch}`, after.note ? { description: after.note } : undefined);
    } catch (e) {
      toast.error('Could not push this fix', { description: (e as Error).message });
    } finally {
      setBusy(false);
      setConfirming(false);
    }
  };
  return (
    <div className="flex flex-wrap items-center gap-2 text-xs text-fg-muted">
      {confirming ? (
        <>
          <span>Push <code>{shortSha(fix.sha)}</code> alone to <code>{fixes.branch}</code>?{fixes.commits.length > 1 && ' The other fixes stay to push.'}</span>
          <Button size="sm" variant="primary" disabled={busy || locked} onClick={push}>
            {busy ? <Spinner className="size-3.5" /> : <Upload className="size-3.5" />}Push
          </Button>
          <Button size="sm" disabled={busy} onClick={() => setConfirming(false)}>Cancel</Button>
        </>
      ) : (
        <>
          <span>Its fix <code>{shortSha(fix.sha)}</code> is not on the MR yet: the reply names it once pushed.</span>
          <Button size="sm" disabled={locked} onClick={() => setConfirming(true)}><Upload className="size-3.5" />Push this fix</Button>
        </>
      )}
    </div>
  );
}
