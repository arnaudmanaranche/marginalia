import { useState } from 'react';
import { ChevronDown, ChevronRight } from 'lucide-react';
import { callSpans, tokens, type Agent } from '../lib/agents';
import { duration } from '../lib/runs';
import { useNow } from '../lib/useNow';
import { cn } from '../lib/utils';
import { AgentCalls } from './AgentCalls';
import { Elapsed } from './ds/Elapsed';
import { LivePill, type LiveTone } from './ds/LivePill';
import { SpanBar } from './ds/SpanBar';
import { ToolChip, ToolChips } from './ds/ToolChip';

const PILL: Record<Agent['state'], { tone: LiveTone; label: string }> = {
  running: { tone: 'run', label: 'Running' }, done: { tone: 'ok', label: 'Finished' }, failed: { tone: 'fail', label: 'Failed' },
  pending: { tone: 'idle', label: 'Waiting' }, skipped: { tone: 'idle', label: 'Skipped' },
};

const money = (usd: number) => `$${usd.toFixed(usd < 1 ? 3 : 2)}`;

// One agent at work (a stage that ran Claude), as a card: who it is (the stage, its model), its state
// and the bill so far, the call it is on with a clock in the "well", a time strip of every call, and
// the finished calls, each opening its card. Folds into one bar with the tools it used.
export function AgentMonitor({ agent, defaultFolded = false }: { agent: Agent; defaultFolded?: boolean }) {
  const [folded, setFolded] = useState(defaultFolded);
  const running = agent.state === 'running';
  const now = useNow(running);
  const pill = PILL[agent.state];
  const u = agent.usage;
  const took = agent.startedAt ? duration((agent.endedAt ? Date.parse(agent.endedAt) : now) - Date.parse(agent.startedAt)) : null;
  const mark = (
    <span aria-hidden className="grid size-6 shrink-0 place-items-center rounded-md bg-sunken font-mono text-[11px] font-semibold text-fg-muted ring-1 ring-inset ring-line-strong">
      {(u?.model ?? agent.label).replace(/^claude-/, '').charAt(0).toUpperCase()}
    </span>
  );
  const cost = u ? <span className={cn('tabular-nums text-xs text-fg-muted', running && 'shimmer rounded')}>{money(u.usd)}</span> : null;

  if (folded) {
    return (
      <button type="button" onClick={() => setFolded(false)} aria-expanded={false} aria-label={`${agent.label}: ${pill.label}, open`}
        className="touch-target flex w-full items-center gap-2.5 rounded-xl border border-line bg-surface px-3 py-2 text-left hover:bg-sunken/40">
        {mark}
        <span className="min-w-0 flex-1 truncate text-sm">{agent.label}</span>
        <ToolChips names={agent.tools} max={4} />
        <LivePill tone={pill.tone} label={pill.label} live={running} />
        {cost}
        <ChevronRight className="size-3.5 shrink-0 text-fg-subtle" aria-hidden />
      </button>
    );
  }
  const { spans, total } = callSpans(agent, now);
  return (
    <article aria-label={agent.label} className={cn('overflow-hidden rounded-xl border bg-surface', agent.state === 'failed' ? 'border-fail/40' : 'border-line')}>
      <header className="flex items-center gap-2.5 px-3 pt-3">
        {mark}
        <div className="min-w-0 flex-1">
          <p className="truncate text-sm font-medium">{agent.label}</p>
          <p className="truncate text-xs text-fg-muted">{u?.model ?? 'Claude'}{u && u.calls > 1 ? ` · ${u.calls} sessions` : ''}</p>
        </div>
        <LivePill tone={pill.tone} label={pill.label} live={running} />
        {cost}
        <button type="button" onClick={() => setFolded(true)} aria-label="Fold away" className="touch-target rounded-md p-1 text-fg-subtle hover:bg-sunken"><ChevronDown className="size-4" aria-hidden /></button>
      </header>

      <div className={cn('mx-3 mt-2.5 flex min-h-11 items-center gap-2 rounded-lg px-3 py-2 text-xs', running ? 'bg-run/10' : agent.state === 'failed' ? 'bg-fail/10' : 'bg-sunken')} aria-live={running ? 'polite' : undefined}>
        {running && agent.current ? (
          <><ToolChip name={agent.current.tool} /><span className="min-w-0 flex-1 truncate" title={agent.current.what}>{agent.current.what}</span><Elapsed from={agent.current.startedAt} className="text-run-ink" /></>
        ) : running ? (
          <><span className="min-w-0 flex-1 truncate text-fg-muted" title={agent.step ?? undefined}>{agent.step ?? 'Thinking'}</span>{agent.startedAt && <Elapsed from={agent.startedAt} className="text-run-ink" />}</>
        ) : (
          <span className="min-w-0 flex-1 truncate">
            {agent.state === 'failed' ? 'Failed' : agent.state === 'done' ? 'Finished' : pill.label}{took && ` in ${took}`}
            <span className="text-fg-muted"> · {agent.calls.length} call{agent.calls.length === 1 ? '' : 's'}{agent.failedCalls > 0 && `, ${agent.failedCalls} failed`}</span>
          </span>
        )}
      </div>

      <div className="px-3 pt-2.5">
        <SpanBar spans={spans} total={total} height="h-2" />
        {u && (
          <p className="mt-1.5 flex flex-wrap gap-x-3 text-[11px] tabular-nums text-fg-muted">
            <span>{u.turns} turns</span><span>in {tokens(u.inputTokens)}</span><span>out {tokens(u.outputTokens)}</span>
            <span>cache {tokens(u.cacheReadTokens)}</span>{u.ms > 0 && <span>Claude {duration(u.ms)}</span>}
          </p>
        )}
      </div>
      <div className="mt-2 border-t border-line"><AgentCalls calls={agent.calls} startedAt={agent.startedAt} running={running} /></div>
    </article>
  );
}
