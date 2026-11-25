import { ArrowRight } from 'lucide-react';
import type { Job } from '../lib/api';
import { ACTIVITY_ROUTE, QUEUE_ROUTE } from '../lib/hashRoute';
import { routeOf, targetOf } from '../lib/jobs';
import { lineOf, median, type QueueView } from '../lib/queue';
import { duration } from '../lib/runs';
import { cn, inTime, timeAgo } from '../lib/utils';
import { BudgetMeter } from './BudgetMeter';
import { LivePill } from './ds/LivePill';
import { Panel, PanelFooter, PanelHeader } from './ds/Panel';
import { StatusMark, markOf } from './ds/StatusMark';

const RECENT = 5;
const NEXT = 3;

function More({ label, onClick }: { label: string; onClick: () => void }) {
  return (
    <PanelFooter>
      <button type="button" onClick={onClick} className="touch-target -my-1 inline-flex items-center gap-1 font-medium text-fg underline-offset-2 hover:underline">{label}<ArrowRight className="size-3.5" aria-hidden /></button>
    </PanelFooter>
  );
}

function Stat({ label, value }: { label: string; value: string }) {
  return <div className="min-w-0"><dt className="text-xs text-fg-muted">{label}</dt><dd className="text-sm font-semibold tabular-nums">{value}</dd></div>;
}

const Line = ({ mark, title, detail, onClick }: { mark: React.ReactNode; title: string; detail: string; onClick?: () => void }) => {
  const body = (
    <>
      <span className="flex size-4 shrink-0 items-center justify-center">{mark}</span>
      <span className="min-w-0 flex-1 truncate" title={title}>{title}</span>
      <span className="shrink-0 text-xs tabular-nums text-fg-muted">{detail}</span>
    </>
  );
  return (
    <li>
      {onClick ? <button type="button" onClick={onClick} className="touch-target flex w-full items-center gap-2.5 px-4 py-2 text-left text-sm transition-colors duration-150 hover:bg-sunken/40">{body}</button>
        : <div className="flex items-center gap-2.5 px-4 py-2 text-sm">{body}</div>}
    </li>
  );
};

// Beside what needs you, the bot's day in brief (ADR 0012): what today cost and ran, what the queue
// does next, and the last jobs. Each panel is a glance, and leads to its full page. `wide`: Home has
// nothing else to show, so the three sit side by side.
export function HomeAside({ wide = false, className, jobs, queue, nextPollAt, now, onOpen }: { wide?: boolean; className?: string; jobs: Job[] | null; queue: QueueView | null; nextPollAt: string | null; now: number; onOpen: (route: string | null) => void }) {
  const today = new Date(now).toDateString();
  const todays = (jobs ?? []).filter((j) => new Date(j.startedAt).toDateString() === today);
  const ended = todays.filter((j) => j.endedAt && j.outcome !== 'running');
  const failed = ended.filter((j) => j.outcome === 'failed').length;
  const typical = median(ended.filter((j) => j.outcome === 'reviewed').map((j) => Date.parse(j.endedAt!) - Date.parse(j.startedAt)));
  const line = queue ? lineOf(queue.tasks) : null;
  const next = line ? [...line.running, ...line.waiting].slice(0, NEXT) : [];
  const recent = (jobs ?? []).filter((j) => j.outcome !== 'running').slice(0, RECENT);
  const pill = !line ? null : line.running.length > 0 ? <LivePill tone="run" label="Running" live detail={line.waiting.length || undefined} /> : line.waiting.length > 0 ? <LivePill tone="warn" label="Waiting" detail={line.waiting.length} /> : <LivePill tone="idle" label="Idle" />;
  return (
    <aside aria-label="The bot today" className={cn(wide ? 'grid min-w-0 items-start gap-4 lg:grid-cols-3' : 'flex min-w-0 flex-col gap-4', className)}>
      <Panel label="Today">
        <PanelHeader title="Today" meta={new Date(now).toLocaleDateString([], { weekday: 'long', day: 'numeric', month: 'long' })} />
        <div className="space-y-3 px-4 pb-4">
          {queue?.budget && <BudgetMeter budget={queue.budget} />}
          <dl className="grid grid-cols-3 gap-3 border-t border-line pt-3">
            <Stat label="Jobs" value={String(todays.length)} />
            <Stat label="Failed" value={String(failed)} />
            <Stat label="Usual review" value={typical === null ? '–' : duration(typical)} />
          </dl>
        </div>
      </Panel>

      <Panel label="Queue">
        <PanelHeader title="Queue" meta={queue ? `${queue.workers.filter((w) => w.taskId).length} of ${queue.workers.length} workers busy` : undefined} aside={pill} />
        <ul className="divide-y divide-line border-t border-line">
          {next.map((t) => <Line key={t.id} mark={<StatusMark state={markOf(t.status)} size={14} />} title={t.label} detail={t.status === 'running' ? 'running' : `#${t.position}`} onClick={() => onOpen(QUEUE_ROUTE)} />)}
          {next.length === 0 && <Line mark={<StatusMark state="pending" size={14} />} title={nextPollAt ? 'Next poll' : 'Nothing runs or waits'} detail={nextPollAt ? inTime(nextPollAt) : ''} />}
        </ul>
        <More label="Open the queue" onClick={() => onOpen(QUEUE_ROUTE)} />
      </Panel>

      <Panel label="Latest jobs">
        <PanelHeader title="Latest jobs" />
        <ul className="divide-y divide-line border-t border-line">
          {recent.map((j) => <Line key={`${j.slug}:${j.id}`} mark={<StatusMark state={markOf(j.outcome)} size={14} />} title={targetOf(j)} detail={timeAgo(j.endedAt)} onClick={() => onOpen(routeOf(j))} />)}
          {jobs !== null && recent.length === 0 && <li className="px-4 py-2.5 text-xs text-fg-muted">Nothing has run yet.</li>}
        </ul>
        <More label="All activity" onClick={() => onOpen(ACTIVITY_ROUTE)} />
      </Panel>
    </aside>
  );
}
