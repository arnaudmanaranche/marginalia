import { ChevronLeft, ChevronRight } from 'lucide-react';
import * as m from 'motion/react-m';
import type { Finding, TourStop } from '../lib/api';
import { chapterSummary } from '../lib/chapters';
import { transition } from '../lib/motion';
import { cn } from '../lib/utils';
import { Kbd } from './ds/Kbd';
import { SeverityDot } from './ds/Severity';
import { StatusMark } from './ds/StatusMark';
import { Timeline, TimelineItem } from './ds/Timeline';
import { Button } from './ui/Button';

// The tour as a rail: every chapter in the order to read them, the ones read marked done, the one
// being read open with what is in it (`children`), the ones to come named and counted. A click on a
// chapter goes there; ← and → move through them. Reading order is the point, so the rail never
// reorders and never hides a chapter that has something in it.
export function ChapterRail({ stops, findings, index, direction, onGo, children }: {
  stops: TourStop[]; findings: Finding[]; index: number; direction: 1 | -1; onGo: (i: number) => void; children: React.ReactNode;
}) {
  return (
    <div>
      {stops.length > 1 && (
        <div className="sticky top-0 z-10 -mx-4 flex items-center justify-between gap-3 border-b border-line bg-surface px-4 py-2.5">
          <p className="flex items-center gap-2 text-xs text-fg-muted" aria-live="polite">
            <span className="font-medium text-zinc-900 dark:text-zinc-100">Chapter {index + 1} of {stops.length}</span>
            <span className="hidden items-center gap-1 sm:flex"><Kbd>←</Kbd><Kbd>→</Kbd></span>
          </p>
          <div className="flex items-center gap-1">
            <Button size="sm" disabled={index === 0} onClick={() => onGo(index - 1)} aria-label="Previous chapter" title="Previous chapter (←)"><ChevronLeft className="size-3.5" /></Button>
            <Button size="sm" disabled={index === stops.length - 1} onClick={() => onGo(index + 1)} title="Next chapter (→)">Next<ChevronRight className="size-3.5" /></Button>
          </div>
        </div>
      )}
      <div className="pt-4">
        <Timeline label="Chapters of the tour">
          {stops.map((stop, i) => {
            const here = i === index;
            const { count, top, threads } = chapterSummary(stop, findings);
            return (
              <TimelineItem
                key={stop.id}
                mark={<StatusMark state={here ? 'current' : i < index ? 'done' : 'pending'} label={here ? 'This chapter' : i < index ? 'Read' : 'Not read yet'} />}
                walked={i < index}
                last={i === stops.length - 1}
                current={here}
                aside={!here && top ? <span className="inline-flex items-center gap-1.5"><SeverityDot level={top} /><span className="sr-only">{top}: </span>{count}</span> : undefined}
              >
                {here ? (
                  <m.div key={stop.id} initial={{ opacity: 0, x: direction * 10 }} animate={{ opacity: 1, x: 0 }} transition={transition.base}>
                    <h2 className="text-base font-semibold leading-snug tracking-tight">{stop.title}</h2>
                    {children}
                  </m.div>
                ) : (
                  <button type="button" onClick={() => onGo(i)} title={stop.title} className={cn('touch-target block w-full truncate text-left text-sm leading-5', i < index ? 'text-fg-muted' : 'text-zinc-900 hover:underline dark:text-zinc-100')}>
                    {stop.title}{stop.supporting && <span className="text-fg-muted"> · supporting</span>}
                  </button>
                )}
              </TimelineItem>
            );
          })}
        </Timeline>
      </div>
    </div>
  );
}
