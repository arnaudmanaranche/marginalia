import { useState } from 'react';
import { AnimatePresence, m } from 'motion/react';
import { ChevronRight } from 'lucide-react';
import { BACKPRESSURE, isQuiet, lineOf, measuresOf, type QueueTask, type QueueView } from '../lib/queue';
import { forecastOf, usualRunOf } from '../lib/queueForecast';
import { unfold } from '../lib/motion';
import { duration } from '../lib/runs';
import { useNow } from '../lib/useNow';
import { cn, timeAgo } from '../lib/utils';
import { LivePill } from './ds/LivePill';
import { StatusMark } from './ds/StatusMark';
import { Panel } from './ds/Panel';
import { BudgetMeter } from './BudgetMeter';
import { QueueTaskRow } from './QueueTaskRow';
import { QueueTrace } from './QueueTrace';

const SHOWN = 8;
const ROW = 'grid grid-cols-[1.5rem_1rem_minmax(0,1fr)_auto] items-center gap-x-3 px-4 py-2 text-left';

function Measure({ label, value, warn = false }: { label: string; value: string; warn?: boolean }) {
  return (
    <div className="min-w-0">
      <dt className="text-xs text-fg-muted">{label}</dt>
      <dd className="flex items-center gap-1.5 text-sm font-semibold whitespace-nowrap tabular-nums">
        {value}{warn && <span className="size-1.5 rounded-full bg-warn" role="img" aria-label="needs a look" />}
      </dd>
    </div>
  );
}

function Lane({ title, count, note, children }: { title: string; count?: number; note?: React.ReactNode; children: React.ReactNode }) {
  return (
    <section aria-label={title} className="min-w-0">
      <h3 className="flex items-baseline gap-1.5 px-4 pt-3 pb-1.5 text-xs font-medium">
        {title}{count !== undefined && <span className="tabular-nums text-fg-muted">{count}</span>}
        {note && <span className="ml-auto truncate font-normal text-fg-muted">{note}</span>}
      </h3>
      <ul className="divide-y divide-line">{children}</ul>
    </section>
  );
}

const clock = (at: number) => new Date(at).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' });

// The bot's next poll (its status says when): not a task yet, so it does not open.
const PollRow = ({ at, now }: { at: number; now: number }) => (
  <li className={ROW}>
    <span /><StatusMark state="pending" label="Scheduled" />
    <span className="min-w-0">
      <span className="block truncate text-sm">Next poll</span>
      <span className="block truncate text-xs text-fg-muted">each project's open MRs, at {clock(at)}</span>
    </span>
    <span className="pr-4.5 text-xs tabular-nums text-fg-muted">{at - now < 5000 ? 'any moment' : `in ${duration(at - now)}`}</span>
  </li>
);

// The bot's queue (GLOSSARY: Queue), read for what comes next. A status line (state, workers, the
// measures, today's budget), then the line on one clock, then in words: what runs and what comes
// next with when it should start, and what ended. Polls that found nothing are most of the line:
// they are ticks on the clock and one folded line in the list, so the tasks that did something
// stand out. Any task opens into its card; a bar on the clock opens its task. Stacks on a narrow screen.
// `nextPollAt`: when the bot polls next, from its status; null when it does not say.
export function QueuePanel({ queue, nextPollAt = null, onOpen }: { queue: QueueView; nextPollAt?: string | null; onOpen: (route: string) => void }) {
  const [openId, setOpenId] = useState<string | null>(null);
  const [quietOpen, setQuietOpen] = useState(false);
  const now = useNow(true);
  const line = lineOf(queue.tasks);
  const meas = measuresOf(queue, now);
  const forecast = forecastOf(queue, now);
  const ended = line.ended.filter((t) => !isQuiet(t));
  const quiet = line.ended.filter(isQuiet);
  const nextPoll = nextPollAt ? Date.parse(nextPollAt) : null;
  // A poll already in the line is the next poll.
  const pollShown = nextPoll !== null && !line.waiting.some((t) => t.kind === 'poll');
  const row = (t: QueueTask) => (
    <QueueTaskRow key={t.id} task={t} now={now} estimate={usualRunOf(queue.tasks, t.kind, now)} slot={forecast.slots.get(t.id)} open={openId === t.id}
      onToggle={() => setOpenId(openId === t.id ? null : t.id)} onOpen={onOpen} />
  );
  const select = (id: string) => {
    setOpenId(id);
    if (quiet.some((t) => t.id === id)) setQuietOpen(true);
    const smooth = !window.matchMedia('(prefers-reduced-motion: reduce)').matches;
    requestAnimationFrame(() => document.querySelector(`[data-task="${CSS.escape(id)}"]`)?.scrollIntoView({ block: 'nearest', behavior: smooth ? 'smooth' : 'auto' }));
  };
  const pill = meas.running > 0
    ? <LivePill tone="run" label="Running" live detail={meas.waiting > 0 ? `${meas.waiting} waiting` : undefined} />
    : meas.waiting > 0 ? <LivePill tone="warn" label="Waiting" detail={meas.waiting} /> : <LivePill tone="idle" label="Idle" />;
  return (
    <Panel>
      <div className="flex flex-wrap items-center gap-x-8 gap-y-3 border-b border-line px-4 py-3">
        {pill}
        <dl className="flex flex-wrap gap-x-6 gap-y-2">
          <Measure label="Workers" value={`${meas.running} of ${queue.workers.length} busy`} />
          <Measure label="Waiting" value={String(meas.waiting)} warn={meas.waiting > BACKPRESSURE} />
          <Measure label="Median wait" value={meas.medianWait === null ? '–' : duration(meas.medianWait)} />
          <Measure label="Median run" value={meas.medianRun === null ? '–' : duration(meas.medianRun)} />
          {/* Tasks, not jobs: Activity counts jobs (one run on one MR), so each says what it counts. */}
          <Measure label="Tasks failed" value={`${meas.failed} of ${meas.done + meas.failed}`} warn={meas.failed > 0} />
        </dl>
        {queue.budget && <BudgetMeter budget={queue.budget} className="w-full lg:ml-auto lg:w-80" />}
      </div>
      <QueueTrace tasks={queue.tasks} now={now} forecast={forecast} nextPoll={pollShown ? nextPoll : null} onSelect={select} />
      <div className="grid border-t border-line lg:grid-cols-2 lg:divide-x lg:divide-line">
        <Lane title="Now and next" note="A person's request goes before a poll">
          {line.running.map(row)}
          {line.waiting.map(row)}
          {pollShown && <PollRow at={nextPoll!} now={now} />}
          {line.running.length + line.waiting.length === 0 && !pollShown && <li className="px-4 py-2.5 text-xs text-fg-muted">Nothing runs or waits. A poll or a person's request starts the next task.</li>}
        </Lane>
        <Lane title="Ended" count={line.ended.length} note={meas.costUsd > 0 && <span title="What the jobs of these tasks cost">${meas.costUsd.toFixed(2)} in jobs</span>}>
          {ended.slice(0, SHOWN).map(row)}
          {quiet.length > 0 && (
            <li>
              <button type="button" onClick={() => setQuietOpen(!quietOpen)} aria-expanded={quietOpen} className={cn('touch-target w-full transition-colors duration-150 hover:bg-sunken/40', ROW)}>
                <span /><StatusMark state="done" />
                <span className="min-w-0">
                  <span className="block truncate text-sm">{quiet.length} poll{quiet.length > 1 ? 's' : ''} found nothing new</span>
                  <span className="block truncate text-xs text-fg-muted">last one {timeAgo(quiet[0].endedAt)} · each is a tick on the clock above</span>
                </span>
                <ChevronRight className={cn('size-3.5 text-fg-muted transition-transform duration-200 motion-reduce:transition-none', quietOpen && 'rotate-90')} aria-hidden />
              </button>
              <AnimatePresence initial={false}>
                {quietOpen && (
                  <m.ul {...unfold} className="divide-y divide-line overflow-hidden border-t border-line bg-sunken/30">
                    {quiet.slice(0, SHOWN).map(row)}
                    {quiet.length > SHOWN && <li className="px-4 py-2 text-xs text-fg-muted">and {quiet.length - SHOWN} earlier</li>}
                  </m.ul>
                )}
              </AnimatePresence>
            </li>
          )}
          {line.ended.length === 0 && <li className="px-4 py-2.5 text-xs text-fg-muted">Nothing has ended yet.</li>}
        </Lane>
      </div>
    </Panel>
  );
}
