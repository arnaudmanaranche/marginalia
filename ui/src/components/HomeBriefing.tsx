import { AlertTriangle, ArrowRight, OctagonAlert, Sparkles } from 'lucide-react';
import type { Note } from '../lib/briefing';

const MARK = {
  fail: <OctagonAlert className="size-4 text-fail" aria-label="Needs a look" />,
  warn: <AlertTriangle className="size-4 text-warn" aria-label="Worth a look" />,
  run: <Sparkles className="size-4 text-run" aria-label="A suggestion" />,
} as const;

// The top of Home (GLOSSARY: Briefing): the greeting and what needs you in one Display line, the
// greeting quiet so the count leads; then one sentence on what changed since you last looked; then
// only the notes that stand out, each with the way to act on it. A quiet day has no notes, and no
// card saying so.
export function HomeBriefing({ greeting, count, known, since, notes, onOpen }: {
  greeting: string; count: number; known: boolean; since: string; notes: Note[]; onOpen: (route: string | null) => void;
}) {
  return (
    <header>
      <h1 className="text-3xl font-semibold tracking-tight text-balance">
        <span className="text-fg-muted">{greeting}.</span>{' '}
        {/* Said once every source answered: "Nothing needs you" while some still load would be a false all-clear. */}
        {!known ? <span aria-label="Counting what needs you" className="inline-block h-8 w-56 animate-pulse rounded-lg bg-sunken align-middle motion-reduce:animate-none" />
          : count === 0 ? 'Nothing needs you.' : `${count} thing${count > 1 ? 's' : ''} need${count > 1 ? '' : 's'} you.`}
      </h1>
      <p className="mt-2 max-w-[70ch] text-fg-muted">{since}</p>
      {notes.length > 0 && (
        <ul aria-label="Worth knowing" className="mt-5 max-w-3xl divide-y divide-line overflow-hidden rounded-xl border border-line bg-surface">
          {notes.map((n) => (
            <li key={n.id} className="flex flex-wrap items-center gap-x-3 gap-y-1 px-4 py-2.5 text-sm">
              <span className="flex size-4 shrink-0 items-center justify-center">{MARK[n.tone]}</span>
              <span className="min-w-0 flex-1 basis-64">{n.text}</span>
              {n.route !== null && (
                <button type="button" onClick={() => onOpen(n.route)} className="touch-target ml-7 inline-flex shrink-0 items-center gap-1 rounded-md text-xs font-medium underline-offset-2 hover:underline sm:ml-0">
                  {n.action}<ArrowRight className="size-3.5" aria-hidden />
                </button>
              )}
            </li>
          ))}
        </ul>
      )}
    </header>
  );
}
