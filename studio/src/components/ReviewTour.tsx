import { useEffect, useRef, useState } from 'react';
import * as m from 'motion/react-m';
import { ChevronLeft, ChevronRight } from 'lucide-react';
import type { Finding, PostedInfo, TourStop } from '../lib/api';
import { Badge } from './ui/Badge';
import { Button } from './ui/Button';
import { FindingsPanel } from './FindingsPanel';
import { NoteMarkdown } from './NoteMarkdown';
import { cn } from '../lib/utils';
import { useMrDiff, usePushes, type DiffScope } from '../lib/useMrDiff';
import { useThreads } from '../lib/useThreads';
import type { Focus } from '../lib/tourFocus';
import { DiffPane } from './DiffPane';
import { StopChat } from './StopChat';

interface Post {
  slug: string;
  iid: string | number;
  allowPosting: boolean;
  locked: boolean;
  posted: Record<string, PostedInfo>;
  reload: () => void;
}

// A guided read of the MR, one stop at a time, in the order the skill chose:
// what the group of changes does, what to check, and the findings on it.
// `diff` says where the code comes from: the MR's slug and the earlier review being read, if any.
export interface DiffSource {
  slug: string;
  version: string | null;
  key: string | undefined;
}

export function ReviewTour({ stops, findings, post, diff: source, showFullDiff, onReport }: { showFullDiff: boolean; stops: TourStop[]; findings: Finding[]; post: Post | null; diff: DiffSource | null; onReport?: (id: string) => void }) {
  const [at, setIndex] = useState(0);
  // A new review can have fewer stops than the one that was open: never point past the last.
  const index = Math.min(at, stops.length - 1);
  const pane = useRef<HTMLElement>(null);
  const diffPane = useRef<HTMLDivElement>(null);
  const [focus, setFocus] = useState<Focus | null>(null);
  const nonce = useRef(0);
  const select = (id: string, source: Focus['source']) => setFocus({ id, source, nonce: ++nonce.current });
  const previous = useRef(0);
  // Which way the swap goes decides which side the new stop slides in from.
  const direction = index >= previous.current ? 1 : -1;
  useEffect(() => {
    previous.current = index;
    pane.current?.scrollTo?.({ top: 0 });
    // A new stop starts at the top of its own diff, with nothing pointed at.
    diffPane.current?.scrollTo?.({ top: 0 });
    setFocus(null);
  }, [index]);
  const stopId = stops[index].id;
  // Where the diff starts: after the push I last reviewed on GitLab until I pick another one.
  const pushes = usePushes(source && !source.version ? source.slug : null, source?.key);
  const [picked, setPicked] = useState<string | null | undefined>(undefined);
  const from = picked === undefined ? pushes?.defaultFrom ?? null : picked;
  const scope: DiffScope = { version: source?.version ?? null, from: source?.version ? null : from };
  // What the MR's conversation says sits on today's code: it is shown with the current diff only.
  const threads = useThreads(source && !source.version ? source.slug : null, source?.key);
  const { state: diff, retry: retryDiff } = useMrDiff(source?.slug ?? null, stopId, source?.key, scope);
  // ← and → move between stops, anywhere but in a field.
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      const el = e.target as HTMLElement | null;
      if (e.metaKey || e.ctrlKey || e.altKey || e.shiftKey || el?.isContentEditable || /^(INPUT|TEXTAREA|SELECT)$/.test(el?.tagName ?? '') || document.querySelector('[role=dialog]')) return;
      if (e.key === 'ArrowRight' && index < stops.length - 1) setIndex(index + 1);
      else if (e.key === 'ArrowLeft' && index > 0) setIndex(index - 1);
    };
    document.addEventListener('keydown', onKey);
    return () => document.removeEventListener('keydown', onKey);
  }, [index, stops.length]);
  const stop = stops[index];
  const fileCount = diff.status === 'ready' ? diff.files.length : null;
  const here = findings.filter((f) => stop.findingIds.includes(f.id));
  const nothing = here.length === 0 ? 'no findings, skim' : null;
  const meta = [fileCount === null ? null : `${fileCount} file${fileCount === 1 ? '' : 's'}`, nothing].filter(Boolean).join(' · ') || ' ';
  const last = index === stops.length - 1;
  return (
    // Without a diff (an MR no longer tracked) the stop takes the width: no empty column beside it.
    <div className={cn('mb-6 grid gap-4 lg:mb-0 lg:min-h-0 lg:flex-1 lg:grid-rows-[minmax(0,1fr)]', source ? 'lg:grid-cols-[minmax(0,26rem)_minmax(0,1fr)]' : 'mx-auto w-full max-w-3xl')}>
    <section ref={pane} aria-label="Review tour" className={cn('rounded-lg border border-line bg-surface px-4 lg:overflow-y-auto', source ? 'lg:h-full' : 'lg:self-start', post ? 'pb-0' : 'pb-4')}>
      {/* Where the read is: one segment per stop (click one to jump), the count, and the way on.
          A single stop has nowhere to go. */}
      {stops.length > 1 && (
      <div className="sticky top-0 z-10 -mx-4 flex items-center gap-3 bg-surface px-4 py-3">
        <ol className="flex flex-1 gap-1" aria-label="Stops">
          {stops.map((s, i) => (
            <li key={s.id} className="flex-1">
              <button aria-label={`Stop ${i + 1}: ${s.title}`} title={s.title} aria-current={i === index} onClick={() => setIndex(i)} className={cn('block h-1.5 w-full rounded-full transition-colors duration-300 motion-reduce:transition-none', i === index ? 'bg-blue-500' : i < index ? 'bg-blue-500/40' : 'bg-zinc-300 dark:bg-zinc-700')} />
            </li>
          ))}
        </ol>
        <span className="text-xs tabular-nums text-fg-muted" aria-live="polite">{index + 1}/{stops.length}</span>
        <div className="flex items-center gap-1">
          <Button size="sm" disabled={index === 0} onClick={() => setIndex(index - 1)} aria-label="Previous stop" title="Previous stop (←)"><ChevronLeft className="size-3.5" /></Button>
          <Button size="sm" title="Next stop (→)" disabled={last} onClick={() => setIndex(index + 1)}>Next<ChevronRight className="size-3.5" /></Button>
        </div>
      </div>
      )}
      <m.div key={stop.id} initial={{ opacity: 0, x: direction * 14 }} animate={{ opacity: 1, x: 0 }} transition={{ duration: 0.24, ease: [0.22, 1, 0.36, 1] }}>
        <h2 className={cn('text-lg font-semibold tracking-tight', stops.length > 1 ? 'mt-1' : 'mt-4')}>{stop.title}{stop.supporting && <Badge className="ml-2 align-middle">Supporting</Badge>}</h2>
        {stop.summary && <NoteMarkdown className="mt-1 text-fg-muted">{stop.summary}</NoteMarkdown>}
        <p className="mt-2 text-xs text-fg-subtle">{meta}</p>
        {here.length > 0 && (
          <div className="mt-4">
            {post ? <FindingsPanel findings={here} threads={threads} compact focus={focus} onFocus={(id) => select(id, 'list')} {...post} /> : (
              <ul className="space-y-1 text-sm">
                {here.map((f) => <li key={f.id}><Badge tone={f.severity === 'critical' ? 'danger' : f.severity === 'important' ? 'warning' : 'neutral'}>{f.severity}</Badge> {f.title}</li>)}
              </ul>
            )}
          </div>
        )}
      </m.div>
      {post && <StopChat key={post.slug} slug={post.slug} stopId={stops[index].id} />}
    </section>
    {source && <div ref={diffPane} className="min-w-0 lg:h-full lg:overflow-y-auto lg:pr-1">
      <DiffPane showAll={showFullDiff} state={diff} findings={findings} threads={threads} focus={focus} scope={scope} pushes={pushes} onFrom={setPicked} onReport={onReport} onSelectFinding={(id) => select(id, 'diff')} onRetry={retryDiff} />
    </div>}
    </div>
  );
}
