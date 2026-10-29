import { useMemo, useRef, useState } from 'react';
import { MessageSquare, Upload } from 'lucide-react';
import type { PostedInfo, Reply, Thread } from '../lib/api';
import { byPlace } from '../lib/replies';
import type { Focus } from '../lib/tourFocus';
import type { FixesState } from '../lib/useFixes';
import { useMrDiff, usePushes, type DiffScope } from '../lib/useMrDiff';
import { DiffPane } from './DiffPane';
import { FixesPanel } from './FixesPanel';
import { RepliesPanel } from './RepliesPanel';

// My own MR, read as the author: no tour of stops, the reviewer threads to answer instead, file by
// file, with the fixes to push over them. On the right, the MR diff with what people said on it;
// pointing at a thread brings its line there.
export function ReplyBoard({ slug, iid, threads, open, replies, posted, fixes, locked, reload, refreshKey, showFullDiff, onReport }: {
  slug: string;
  iid: string | number;
  // Every thread of the MR, for the diff; `open` are the ones a reviewer is waiting on me for.
  threads: Thread[];
  open: Thread[];
  replies: Reply[];
  posted: Record<string, PostedInfo>;
  fixes: FixesState;
  locked: boolean;
  reload: () => void;
  refreshKey: string | undefined;
  showFullDiff: boolean;
  onReport?: (id: string) => void;
}) {
  const ordered = useMemo(() => byPlace(open), [open]);
  const [selected, setSelected] = useState<string | null>(null);
  const [focus, setFocus] = useState<Focus | null>(null);
  const nonce = useRef(0);
  const select = (id: string) => {
    setSelected(id);
    setFocus({ id, source: 'list', nonce: ++nonce.current });
  };
  const pushes = usePushes(slug, refreshKey);
  const [picked, setPicked] = useState<string | null | undefined>(undefined);
  const scope: DiffScope = { version: null, from: picked === undefined ? pushes?.defaultFrom ?? null : picked };
  const { state: diff, retry } = useMrDiff(slug, '', refreshKey, scope);
  const toPush = fixes.fixes?.state === 'ready' ? fixes.fixes.commits.length : 0;

  return (
    <div className="mb-6 grid gap-4 lg:mb-0 lg:min-h-0 lg:flex-1 lg:grid-cols-[minmax(0,26rem)_minmax(0,1fr)] lg:grid-rows-[minmax(0,1fr)]">
      <section aria-label="Reviewer threads" className="rounded-lg border border-line bg-surface px-4 pb-4 lg:h-full lg:overflow-y-auto">
        <div className="sticky top-0 z-10 -mx-4 flex flex-wrap items-center justify-between gap-2 bg-surface px-4 py-3 text-xs text-fg-muted">
          <span className="inline-flex items-center gap-1.5 font-medium uppercase tracking-wide"><MessageSquare className="size-3.5" aria-hidden />Reviewer threads</span>
          <span>{ordered.length === 0 ? 'nothing to answer' : `${ordered.length} to answer`}</span>
        </div>
        <div className="mb-4 rounded-lg border border-line p-3">
          <h2 className="mb-2 inline-flex items-center gap-1.5 text-sm font-semibold"><Upload className="size-3.5" aria-hidden />Fixes to push{toPush > 0 && <span className="font-normal text-fg-muted">({toPush})</span>}</h2>
          <FixesPanel slug={slug} iid={iid} locked={locked} state={fixes} />
        </div>
        <RepliesPanel slug={slug} threads={ordered} replies={replies} posted={posted} fixes={fixes.fixes} onFixes={fixes.setFixes} locked={locked} reload={reload} selected={selected} onSelect={select} />
      </section>
      <div className="min-w-0 lg:h-full lg:overflow-y-auto lg:pr-1">
        <DiffPane showAll={showFullDiff} state={diff} findings={[]} threads={threads} focus={focus} scope={scope} pushes={pushes} onFrom={setPicked} onReport={onReport} onSelectFinding={() => {}} onRetry={retry} />
      </div>
    </div>
  );
}
