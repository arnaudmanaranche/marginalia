import { useState } from 'react';
import { ChevronDown, GitCommitHorizontal } from 'lucide-react';
import type { Push, Pushes } from '../lib/api';
import { cn, timeAgo } from '../lib/utils';
import { Badge } from './ui/Badge';
import { badgeClass } from './ui/badgeStyles';

const plural = (n: number, word: string) => `${n} ${word}${n === 1 ? '' : word.endsWith('sh') ? 'es' : 's'}`;

// The MR's pushes, oldest first, to choose what the diff shows: the whole MR, or what came after
// one push (by default the one I last reviewed on GitLab). Each push says what it added and who
// looked at it: my last review, the bot's reports (an earlier one opens with `onReport`), the head.
export function PushTimeline({ pushes, from, onFrom: choose, onReport }: { pushes: Pushes; from: string | null; onFrom: (from: string | null) => void; onReport?: (id: string) => void }) {
  const [open, setOpen] = useState(false);
  // Picking a start folds the list back: the diff below is what the reader came for.
  const onFrom = (next: string | null) => {
    choose(next);
    setOpen(false);
  };
  const list = pushes.pushes;
  const start = from === null ? -1 : list.findIndex((p) => p.headSha === from);
  const after = list.slice(start + 1);
  const commits = after.flatMap((p) => p.commits.map((c) => ({ ...c, push: p.n })));
  const rebased = after.some((p) => p.rebased);
  const label = start < 0
    ? `Whole MR · ${plural(list.length, 'push')}`
    : `After push ${list[start].n}${list[start].youReviewed ? ' (your last review)' : ''} · ${plural(after.length, 'push')}, ${plural(commits.length, 'commit')}`;

  return (
    <div className="mb-3 rounded-lg border border-line text-xs">
      <button
        aria-expanded={open}
        onClick={() => setOpen(!open)}
        className="flex w-full items-center justify-between gap-2 px-3 py-2 text-left hover:bg-zinc-50 dark:hover:bg-zinc-800/60"
      >
        <span><span className="text-fg-muted">Showing </span><span className="font-medium">{label}</span></span>
        <ChevronDown className={cn('size-3.5 shrink-0 text-fg-muted transition-transform motion-reduce:transition-none', open && 'rotate-180')} aria-hidden />
      </button>
      {open && (
        <div className="border-t border-line px-3 py-2">
          <p className="mb-2 text-fg-muted">Pick where to start: the diff shows what came after that push, up to now.</p>
          <ol className="space-y-0.5" aria-label="Pushes">
            <li>
              <Choice active={start < 0} onClick={() => onFrom(null)}>
                <span className="font-medium">Whole MR</span>
                <span className="text-fg-muted">everything since the target branch</span>
              </Choice>
            </li>
            {list.map((p, i) => <li key={p.headSha}><PushRow push={p} inRange={i > start && start >= 0} active={i === start} onPick={() => onFrom(p.headSha)} onReport={onReport} /></li>)}
          </ol>
        </div>
      )}
      {start >= 0 && commits.length > 0 && (
        <ul className="space-y-0.5 border-t border-line px-3 py-2" aria-label="Commits shown">
          {rebased && <li className="mb-1 text-amber-700 dark:text-amber-300">The branch was rebased since: the diff also holds what came from the target branch.</li>}
          {commits.map((c) => (
            <li key={c.sha} className="flex items-baseline gap-2">
              <GitCommitHorizontal className="size-3.5 shrink-0 self-center text-fg-subtle" aria-hidden />
              <code className="shrink-0 text-fg-muted">{c.sha.slice(0, 8)}</code>
              <span className="min-w-0 truncate">{c.title}</span>
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}

function Choice({ active, disabled, onClick, children }: { active: boolean; disabled?: boolean; onClick: () => void; children: React.ReactNode }) {
  return (
    <button
      aria-pressed={active}
      disabled={disabled}
      onClick={onClick}
      className={cn('flex w-full flex-wrap items-center gap-2 rounded px-2 py-1 text-left', active ? 'bg-zinc-900 text-white dark:bg-zinc-100 dark:text-zinc-900 [&_.text-fg-muted]:text-current' : 'hover:bg-zinc-100 disabled:cursor-default disabled:hover:bg-transparent dark:hover:bg-zinc-800')}
    >
      {children}
    </button>
  );
}

// One push: when, how many commits, and the marks. The head has nothing after it to show. The
// bot's earlier report on it opens beside the row (a button can't hold another).
function PushRow({ push, inRange, active, onPick, onReport }: { push: Push; inRange: boolean; active: boolean; onPick: () => void; onReport?: (id: string) => void }) {
  const earlier = push.reports.filter((id): id is string => id !== null);
  return (
    <div className={cn('flex items-center gap-1 border-l-2 pl-1', inRange ? 'border-blue-500' : 'border-transparent')}>
      <div className="min-w-0 flex-1">
        <Choice active={active} disabled={push.head} onClick={onPick}>
          <span className="font-mono">Push {push.n}</span>
          <span className="text-fg-muted">{timeAgo(push.at)} · {push.rebased ? 'rebased' : plural(push.commits.length, 'commit')}</span>
          {push.youReviewed && <Badge tone="info">Your last review</Badge>}
          {push.reports.includes(null) && <Badge tone="violet">This report</Badge>}
          {push.head && <Badge tone="neutral">Head</Badge>}
        </Choice>
      </div>
      {onReport && earlier.length > 0 && (
        <button onClick={() => onReport(earlier[0])} title={earlier.length > 1 ? 'Read the latest of the reports the bot wrote on this push' : 'Read the report the bot wrote on this push'} className={cn(badgeClass({ tone: 'violet' }), 'shrink-0 hover:underline')}>
          {earlier.length > 1 ? `${earlier.length} earlier reports` : 'Earlier report'}
        </button>
      )}
    </div>
  );
}
