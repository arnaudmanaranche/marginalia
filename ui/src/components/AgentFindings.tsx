import { useState } from 'react';
import { AnimatePresence, m } from 'motion/react';
import type { FoundFinding } from '../lib/api';
import type { Swarm } from '../lib/agents';
import { duration } from '../lib/runs';
import { useNow } from '../lib/useNow';
import { cn, timeAgo } from '../lib/utils';
import { SeverityDot } from './ds/Severity';
import { StatusMark } from './ds/StatusMark';
import { ToolChip } from './ds/ToolChip';

const ROWS = 4;

// A staged review's chapter reviewers, the way a verification swarm is shown: one calm row per
// reviewer with its state, what it is doing and how far it got, and below, what they found sliding
// into a short feed, newest first. A row filters the feed to its findings; a click again shows all.
export function AgentFindings({ swarm, title = 'Chapter reviewers' }: { swarm: Swarm; title?: string }) {
  const [only, setOnly] = useState<string | null>(null);
  const [all, setAll] = useState(false);
  const running = swarm.agents.some((a) => a.state === 'running');
  const now = useNow(running);
  const done = swarm.agents.filter((a) => a.state === 'done' || a.state === 'failed').length;
  const feed = only ? swarm.found.filter((f) => f.stage === only) : swarm.found;
  const shown = all ? feed : feed.slice(0, ROWS);
  const labelOf = (stage: string) => swarm.agents.find((a) => a.id === stage)?.label.replace(/^Review: /, '') ?? stage;
  return (
    <section aria-label={title} className="overflow-hidden rounded-xl border border-line bg-surface">
      <header className="flex items-center justify-between gap-3 border-b border-line px-3 py-2">
        <h3 className="text-sm font-medium">{title}</h3>
        <span className="text-xs tabular-nums text-fg-muted">{done} of {swarm.agents.length} done · {swarm.found.length} found</span>
      </header>
      <ul className="divide-y divide-line">
        {swarm.agents.map((a) => {
          const mine = swarm.found.filter((f) => f.stage === a.id).length;
          const doing = a.current ? a.current.what : a.step;
          const took = a.startedAt ? duration((a.endedAt ? Date.parse(a.endedAt) : now) - Date.parse(a.startedAt)) : null;
          return (
            <li key={a.id}>
              <button type="button" aria-pressed={only === a.id} onClick={() => { setOnly(only === a.id ? null : a.id); setAll(false); }}
                className={cn('touch-target grid w-full grid-cols-[1rem_minmax(0,1fr)_auto] items-center gap-x-2.5 px-3 py-2 text-left text-xs', only === a.id ? 'bg-sunken/60' : 'hover:bg-sunken/40')}>
                <StatusMark state={a.state} size={14} />
                <span className="min-w-0">
                  <span className="block truncate text-sm">{a.label.replace(/^Review: /, '')}</span>
                  <span className="flex min-w-0 items-center gap-1.5 text-fg-muted">
                    {a.state === 'running' && a.current && <ToolChip name={a.current.tool} />}
                    <span className="truncate">{a.state === 'running' ? doing ?? 'Thinking' : a.state === 'pending' ? 'Waiting for a free slot' : a.state === 'failed' ? 'Could not review this chapter' : 'Reviewed'}</span>
                  </span>
                </span>
                <span className="text-right tabular-nums text-fg-muted">
                  <span className="hidden sm:inline">{a.calls.length} calls · </span>{mine} found{took && <span className="hidden sm:inline"> · {took}</span>}
                </span>
              </button>
            </li>
          );
        })}
      </ul>
      <div className="border-t border-line">
        <h4 className="bg-sunken/40 px-3 py-1 text-[11px] font-medium uppercase tracking-wide text-fg-muted">
          Found{only ? ` · ${labelOf(only)}` : ''}
        </h4>
        {feed.length === 0 ? (
          <p className="px-3 py-2.5 text-xs text-fg-muted">{running || swarm.agents.some((a) => a.state === 'pending') ? 'Nothing found yet: findings show here as each chapter ends.' : only ? 'This chapter found nothing.' : 'The chapters found nothing.'}</p>
        ) : (
          <ul aria-label="Findings as they were found" aria-live="polite" className="divide-y divide-line">
            <AnimatePresence initial={false}>
              {shown.map((f: FoundFinding) => (
                <m.li key={`${f.stage}:${f.id}`} initial={{ opacity: 0, y: -6 }} animate={{ opacity: 1, y: 0 }} exit={{ opacity: 0 }} transition={{ duration: 0.25 }}
                  className="grid grid-cols-[0.5rem_minmax(0,1fr)_auto] items-center gap-x-2.5 px-3 py-2 text-xs">
                  <SeverityDot level={f.severity} />
                  <span className="min-w-0">
                    <span className="block truncate text-sm"><span className="sr-only">{f.severity}: </span>{f.title}</span>
                    <span className="block truncate text-fg-muted">
                      <span className="capitalize">{f.severity}</span>{!only && ` · ${labelOf(f.stage)}`}
                      {f.path && <span className="hidden font-mono sm:inline"> · {f.path}{f.line ? `:${f.line}` : ''}</span>}
                    </span>
                  </span>
                  <span className="text-fg-muted" title={new Date(f.at).toLocaleString()}>{timeAgo(f.at)}</span>
                </m.li>
              ))}
            </AnimatePresence>
          </ul>
        )}
        {feed.length > ROWS && (
          <button type="button" onClick={() => setAll(!all)} className="w-full border-t border-line px-3 py-1.5 text-left text-xs text-fg-muted hover:bg-sunken/40">
            {all ? 'Show the latest only' : `Show all ${feed.length}`}
          </button>
        )}
      </div>
    </section>
  );
}
