import { useState } from 'react';
import { ListOrdered } from 'lucide-react';
import { BACKPRESSURE, estimateOf, lineOf, measuresOf, type QueueTask, type QueueView } from '../lib/queue';
import { duration } from '../lib/runs';
import { useNow } from '../lib/useNow';
import { LivePill } from './ds/LivePill';
import { StatusMark } from './ds/StatusMark';
import { Panel, PanelHeader } from './ds/Panel';
import { BudgetMeter } from './BudgetMeter';
import { QueueDepth } from './QueueDepth';
import { QueueTaskRow } from './QueueTaskRow';

const ENDED_SHOWN = 8;

function Measure({ label, value, note, warn = false }: { label: string; value: string; note?: string; warn?: boolean }) {
  return (
    <div className="min-w-0 rounded-lg border border-line px-3 py-2">
      <p className="text-xs text-fg-muted">{label}</p>
      <p className="flex items-center gap-1.5 text-lg font-semibold tabular-nums">
        {value}
        {warn && <span className="size-1.5 rounded-full bg-warn" role="img" aria-label="needs a look" />}
      </p>
      {note && <p className="truncate text-xs text-fg-subtle">{note}</p>}
    </div>
  );
}

function Lane({ title, count, children, empty }: { title: string; count: number; children: React.ReactNode; empty: string }) {
  return (
    <section aria-label={title} className="min-w-0">
      <h3 className="flex items-center gap-1.5 px-4 pt-3 pb-1.5 text-xs font-medium text-fg-muted">{title}{!title.includes('·') && <span className="tabular-nums">{count}</span>}</h3>
      {count === 0 ? <p className="px-4 pb-3 text-xs text-fg-muted">{empty}</p> : <ul className="divide-y divide-line">{children}</ul>}
    </section>
  );
}

// The bot's queue (GLOSSARY: Queue), the way a CI tool shows its runners: four numbers, today's
// budget, the backlog
// over the last two hours, then the line from left to right: what waits in order, what each worker
// runs (one project each) and how far it is against the usual time of its kind, and what just ended. Any task opens
// into its card. Stacks on a narrow screen.
export function QueuePanel({ queue, onOpen }: { queue: QueueView; onOpen: (route: string) => void }) {
  const [openId, setOpenId] = useState<string | null>(null);
  const line = lineOf(queue.tasks);
  const now = useNow(line.waiting.length + line.running.length > 0);
  const m = measuresOf(queue, now);
  const byId = new Map(queue.tasks.map((t) => [t.id, t]));
  const row = (t: QueueTask) => (
    <QueueTaskRow key={t.id} task={t} now={now} estimate={estimateOf(queue.tasks, t.kind, now)} open={openId === t.id}
      onToggle={() => setOpenId(openId === t.id ? null : t.id)} onOpen={onOpen} />
  );
  const pill = m.running > 0
    ? <LivePill tone="run" label="Running" live detail={m.waiting > 0 ? `${m.waiting} waiting` : undefined} />
    : m.waiting > 0 ? <LivePill tone="warn" label="Waiting" detail={m.waiting} /> : <LivePill tone="idle" label="Idle" />;
  return (
    <Panel label="Queue">
      <PanelHeader icon={<ListOrdered className="size-4" aria-hidden />} title="Queue" meta={`${queue.workers.length} worker${queue.workers.length > 1 ? 's' : ''} · a person's request goes before a poll`} aside={pill} />
      <div className="grid grid-cols-2 gap-2 px-4 sm:grid-cols-4">
        <Measure label="Waiting" value={String(m.waiting)} warn={m.waiting > BACKPRESSURE} />
        <Measure label="Median wait" value={m.medianWait === null ? '–' : duration(m.medianWait)} />
        <Measure label="Median run" value={m.medianRun === null ? '–' : duration(m.medianRun)} />
        {/* Tasks, not jobs: Activity counts jobs (one run on one MR), so each says what it counts. */}
        <Measure label="Tasks done · failed" value={`${m.done} · ${m.failed}`} note={`of the last ${m.done + m.failed} ended`} warn={m.failed > 0} />
      </div>
      {queue.budget && <BudgetMeter budget={queue.budget} className="px-4 pt-3" />}
      <QueueDepth tasks={queue.tasks} now={now} className="px-4 pt-3" />
      <div className="mt-2 grid border-t border-line lg:grid-cols-3 lg:divide-x lg:divide-line">
        <Lane title="Waiting" count={line.waiting.length} empty="Nothing waits.">{line.waiting.map(row)}</Lane>
        <Lane title={`Workers · ${line.running.length} of ${queue.workers.length} busy`} count={queue.workers.length} empty="No worker.">
          {queue.workers.map((w) => {
            const task = w.taskId ? byId.get(w.taskId) : undefined;
            return task ? row(task) : (
              <li key={w.id} className="flex items-center gap-3 px-4 py-2.5 text-xs text-fg-muted">
                <span className="w-6" /><StatusMark state="pending" label="Idle" /><span>{w.name} · idle: a poll or a person's request starts it</span>
              </li>
            );
          })}
        </Lane>
        <Lane title="Ended" count={line.ended.length} empty="Nothing has ended yet.">{line.ended.slice(0, ENDED_SHOWN).map(row)}</Lane>
      </div>
      {m.costUsd > 0 && <p className="border-t border-line px-4 py-2 text-xs text-fg-muted">The jobs of these tasks cost <span className="tabular-nums">${m.costUsd.toFixed(2)}</span>.</p>}
    </Panel>
  );
}
