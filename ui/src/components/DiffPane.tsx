import { useState } from 'react';
import * as m from 'motion/react-m';
import type { Finding, Pushes, Thread } from '../lib/api';
import type { DiffState } from '../lib/useMrDiff';
import { DiffFileView } from './DiffFileView';
import type { Focus } from '../lib/tourFocus';
import { DiffSkeleton } from './DiffSkeleton';
import { Button } from './ui/Button';
import type { DiffScope } from '../lib/useMrDiff';
import { PushTimeline } from './PushTimeline';
import { FileStrip } from './FileStrip';

// The code of the current stop: its files from the MR diff, findings inline. Over it, the MR's
// pushes say which code that is: the whole MR, or what came after one push. An earlier review
// shows the code as it saw it.
export function DiffPane({ showAll, state, findings, focus, threads: allThreads, scope, pushes, onFrom, onReport, onSelectFinding, onRetry }: { showAll: boolean; state: DiffState; findings: Finding[]; threads: Thread[]; focus: Focus | null; scope: DiffScope; pushes: Pushes | null; onFrom: (from: string | null) => void; onReport?: (id: string) => void; onSelectFinding: (id: string) => void; onRetry: () => void }) {
  // A bot's note (a CI table, a preview link) is not a conversation about the code: left out.
  const threads = allThreads.filter((t) => !t.notes[0]?.bot);
  // The file a click on its chip points at; a new nonce each time, so the same file can be asked twice.
  const [jump, setJump] = useState<{ path: string; nonce: number } | null>(null);
  const toggle = scope.version !== null
    ? <p className="mb-3 text-xs text-fg-muted">The code as this earlier review saw it.</p>
    : pushes && pushes.pushes.length > 0 ? <PushTimeline pushes={pushes} from={scope.from} onFrom={onFrom} onReport={onReport} /> : null;
  if (state.status === 'idle') return null;
  if (state.status === 'loading') return <>{toggle}<DiffSkeleton /></>;
  if (state.status === 'error') {
    return (
      <>
        {toggle}
        <div role="alert" className="flex flex-wrap items-center gap-3 rounded-lg border border-line p-4 text-sm text-fg-muted">
          <span>The diff could not be loaded ({state.message}).</span>
          <Button size="sm" onClick={onRetry}>Try again</Button>
        </div>
      </>
    );
  }
  const since = scope.version === null && scope.from !== null;
  // The agent reads every line: with the full diff off, a reader sees what it flagged and what people said.
  const flagged = (path: string, oldPath?: string | null) => findings.some((f) => f.path === path) || threads.some((t) => t.path === path || t.path === oldPath);
  const flaggedFiles = state.files.filter((f) => flagged(f.path, f.oldPath));
  // A chapter never shows an empty pane: with nothing flagged in its files, it shows them all.
  const files = showAll || since || flaggedFiles.length === 0 ? state.files : flaggedFiles;
  const hidden = state.files.length - files.length;
  // What a review found sits on the code as it stood then: it only lines up with a diff of that code.
  const inline = since ? [] : findings;
  return (
    <>
      {toggle}
      <FileStrip files={files} findings={inline} onJump={(path) => setJump({ path, nonce: Date.now() })} />
      {state.approximate && <p className="mb-3 text-xs text-fg-muted">This review did not record its version: the code shown is the one pushed just before it was written.</p>}
      {!files.length ? <p className="text-sm text-fg-muted">{since ? 'Nothing in this stop changed after that push.' : "None of this stop's files is in the MR diff."}</p> : (
        <m.div initial={{ opacity: 0, y: 8 }} animate={{ opacity: 1, y: 0 }} transition={{ duration: 0.28, ease: [0.22, 1, 0.36, 1] }} className="space-y-3">
          {files.map((f, i) => <DiffFileView key={f.path} file={f} findings={inline} threads={since ? [] : threads} defaultOpen={i < 3} focus={focus} jump={jump} onSelectFinding={onSelectFinding} />)}
        </m.div>
      )}
      {hidden > 0 && files.length > 0 && <p className="mt-3 text-xs text-fg-muted">{hidden} file{hidden === 1 ? '' : 's'} with nothing flagged hidden (Settings, "Show the full diff").</p>}
    </>
  );
}
