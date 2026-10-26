import * as m from 'motion/react-m';
import type { Finding, Pushes, Thread } from '../lib/api';
import type { DiffState } from '../lib/useMrDiff';
import { DiffFileView } from './DiffFileView';
import type { Focus } from '../lib/tourFocus';
import { DiffSkeleton } from './DiffSkeleton';
import { Button } from './ui/Button';
import type { DiffScope } from '../lib/useMrDiff';
import { PushTimeline } from './PushTimeline';

// The code of the current stop: its files from the MR diff, findings inline. Over it, the MR's
// pushes say which code that is: the whole MR, or what came after one push. An earlier review
// shows the code as it saw it.
export function DiffPane({ showAll, state, findings, focus, threads, scope, pushes, onFrom, onReport, onSelectFinding, onRetry }: { showAll: boolean; state: DiffState; findings: Finding[]; threads: Thread[]; focus: Focus | null; scope: DiffScope; pushes: Pushes | null; onFrom: (from: string | null) => void; onReport?: (id: string) => void; onSelectFinding: (id: string) => void; onRetry: () => void }) {
  const toggle = scope.version !== null
    ? <p className="mb-3 text-xs text-fg-muted">The code as this earlier review saw it.</p>
    : pushes && pushes.pushes.length > 0 ? <PushTimeline pushes={pushes} from={scope.from} onFrom={onFrom} onReport={onReport} /> : null;
  if (state.status === 'idle') return null;
  if (state.status === 'loading') return <>{toggle}<DiffSkeleton /></>;
  if (state.status === 'error') {
    return (
      <>
        {toggle}
        <div role="alert" className="flex flex-wrap items-center gap-3 rounded-lg border border-zinc-200 p-4 text-sm text-fg-muted dark:border-zinc-800">
          <span>The diff could not be loaded ({state.message}).</span>
          <Button size="sm" onClick={onRetry}>Try again</Button>
        </div>
      </>
    );
  }
  const since = scope.version === null && scope.from !== null;
  // The agent reads every line: with the full diff off, a reader sees what it flagged and what people said.
  const flagged = (path: string, oldPath?: string | null) => findings.some((f) => f.path === path) || threads.some((t) => t.path === path || t.path === oldPath);
  const files = showAll || since ? state.files : state.files.filter((f) => flagged(f.path, f.oldPath));
  const hidden = state.files.length - files.length;
  // What a review found sits on the code as it stood then: it only lines up with a diff of that code.
  const inline = since ? [] : findings;
  return (
    <>
      {toggle}
      {state.approximate && <p className="mb-3 text-xs text-fg-subtle">This review did not record its version: the code shown is the one pushed just before it was written.</p>}
      {!files.length ? <p className="text-sm text-fg-muted">{hidden > 0 ? `Nothing flagged here: ${hidden} file${hidden === 1 ? '' : 's'} hidden by the Settings page's "Show the full diff" option.` : since ? 'Nothing in this stop changed after that push.' : "None of this stop's files is in the MR diff."}</p> : (
        <m.div initial={{ opacity: 0, y: 8 }} animate={{ opacity: 1, y: 0 }} transition={{ duration: 0.28, ease: [0.22, 1, 0.36, 1] }} className="space-y-3">
          {files.map((f, i) => <DiffFileView key={f.path} file={f} findings={inline} threads={since ? [] : threads} defaultOpen={i < 3} focus={focus} onSelectFinding={onSelectFinding} />)}
        </m.div>
      )}
      {hidden > 0 && files.length > 0 && <p className="mt-3 text-xs text-fg-subtle">{hidden} file{hidden === 1 ? '' : 's'} with nothing flagged hidden (Settings, "Show the full diff").</p>}
    </>
  );
}
