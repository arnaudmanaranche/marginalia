import { useEffect, useRef, useState } from 'react';
import type { Finding, PostedInfo, TourStop } from '../lib/api';
import { Badge } from './ui/Badge';
import { FindingsPanel } from './FindingsPanel';
import { NoteMarkdown } from './NoteMarkdown';
import { cn } from '../lib/utils';
import { useMrDiff, usePushes, type DiffScope } from '../lib/useMrDiff';
import { useThreads } from '../lib/useThreads';
import type { Focus } from '../lib/tourFocus';
import { DiffPane } from './DiffPane';
import { StopChat } from './StopChat';
import { SeverityBadge } from './ds/Severity';
import { ChapterRail } from './ChapterRail';

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

export function ReviewTour({ stops, findings, post, diff: source, showFullDiff, onReport, target = null }: { showFullDiff: boolean; target?: string | null; stops: TourStop[]; findings: Finding[]; post: Post | null; diff: DiffSource | null; onReport?: (id: string) => void }) {
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
  // A link to a finding (`?finding=`) opens its stop and points at it, once its stop is shown.
  const pending = useRef<string | null>(null);
  useEffect(() => {
    const at = target ? stops.findIndex((s) => s.findingIds.includes(target)) : -1;
    if (at < 0) return;
    // The stop effect below takes it on mount or on a stop change; on the stop already shown, point now.
    pending.current = target;
    if (at === index) select(target!, 'list');
    else setIndex(at);
  }, [target, stops]); // eslint-disable-line react-hooks/exhaustive-deps
  useEffect(() => {
    previous.current = index;
    pane.current?.scrollTo?.({ top: 0 });
    // A new stop starts at the top of its own diff, with nothing pointed at, unless a link named a finding on it.
    diffPane.current?.scrollTo?.({ top: 0 });
    const linked = pending.current && stops[index]?.findingIds.includes(pending.current) ? pending.current : null;
    if (linked) { pending.current = null; select(linked, 'list'); }
    else setFocus(null);
  }, [index]); // eslint-disable-line react-hooks/exhaustive-deps
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
  return (
    // Without a diff (an MR no longer tracked) the stop takes the width: no empty column beside it.
    <div className={cn('mb-6 grid gap-4 lg:mb-0 lg:min-h-0 lg:flex-1 lg:grid-rows-[minmax(0,1fr)]', source ? 'lg:grid-cols-[minmax(0,26rem)_minmax(0,1fr)]' : 'mx-auto w-full max-w-3xl')}>
    <section ref={pane} aria-label="Review tour" className={cn('rounded-xl border border-line bg-surface px-4 lg:overflow-y-auto', source ? 'lg:h-full' : 'lg:self-start', post ? 'pb-0' : 'pb-4')}>
      <ChapterRail stops={stops} findings={findings} index={index} direction={direction} onGo={setIndex}>
        {stop.supporting && <Badge className="mt-1">Supporting</Badge>}
        {stop.summary && <NoteMarkdown className="mt-1 text-fg-muted">{stop.summary}</NoteMarkdown>}
        <p className="mt-2 text-xs text-fg-muted">{meta}</p>
        {here.length > 0 && (
          <div className="mt-3">
            {post ? <FindingsPanel findings={here} threads={threads} compact focus={focus} onFocus={(id) => select(id, 'list')} {...post} /> : (
              <ul className="space-y-1 text-sm">
                {here.map((f) => <li key={f.id} className="flex items-start gap-2"><SeverityBadge level={f.severity} /><span>{f.title}</span></li>)}
              </ul>
            )}
          </div>
        )}
      </ChapterRail>
      {post && <StopChat key={post.slug} slug={post.slug} stopId={stops[index].id} />}
    </section>
    {source && <div ref={diffPane} className="min-w-0 lg:h-full lg:overflow-y-auto lg:pr-1">
      <DiffPane showAll={showFullDiff} state={diff} findings={findings} threads={threads} focus={focus} scope={scope} pushes={pushes} onFrom={setPicked} onReport={onReport} onSelectFinding={(id) => select(id, 'diff')} onRetry={retryDiff} />
    </div>}
    </div>
  );
}
