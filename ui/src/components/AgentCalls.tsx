import { useState } from 'react';
import { CornerDownRight } from 'lucide-react';
import type { ToolCallRecord } from '../lib/api';
import { callState } from '../lib/agents';
import { duration } from '../lib/runs';
import { cn } from '../lib/utils';
import { StatusMark } from './ds/StatusMark';
import { ToolChip } from './ds/ToolChip';

// An agent's tool calls, newest first, three rows tall with the rest scrolling. Each row is its
// state, the tool, what it did and how long it took; a click opens its card in place with when it
// started on the agent's clock, how long it took, whether a sub-agent made it, and its error.
export function AgentCalls({ calls, startedAt, running }: { calls: ToolCallRecord[]; startedAt: string | null; running: boolean }) {
  const [openId, setOpenId] = useState<string | null>(null);
  if (!calls.length) return <p className="px-3 py-2 text-xs text-fg-muted">{running ? 'No tool called yet.' : 'It called no tool.'}</p>;
  const t0 = Date.parse(startedAt ?? calls[0].startedAt);
  const newest = [...calls].reverse();
  return (
    // Three rows tall; while a call's card is open the list grows, so the card is never cut.
    <ul aria-label="Tool calls" className={cn('divide-y divide-line overflow-y-auto', openId ? 'max-h-80' : 'max-h-[6.75rem]')}>
      {newest.map((c) => {
        const open = openId === c.id;
        const state = callState(c, running);
        return (
          <li key={c.id}>
            <button type="button" aria-expanded={open} onClick={() => setOpenId(open ? null : c.id)}
              className={cn('touch-target grid h-9 w-full grid-cols-[0.875rem_auto_minmax(0,1fr)_auto] items-center gap-2 px-3 text-left text-xs', open ? 'bg-sunken/60' : 'hover:bg-sunken/40')}>
              <StatusMark state={state} size={14} label={state === 'skipped' ? 'No result' : undefined} />
              <ToolChip name={c.tool} />
              <span className="flex min-w-0 items-center gap-1">
                {c.sub && <CornerDownRight className="size-3 shrink-0 text-fg-subtle" aria-label="Sub-agent" />}
                <span className="truncate" title={c.what}>{c.what}</span>
              </span>
              <span className="tabular-nums text-fg-muted">{c.ms !== null ? duration(c.ms) : state === 'running' ? '…' : '–'}</span>
            </button>
            {open && (
              <dl className="grid grid-cols-[auto_1fr] gap-x-3 gap-y-0.5 bg-sunken/30 px-3 py-2 text-xs">
                <dt className="text-fg-muted">Tool</dt><dd className="font-mono">{c.tool}</dd>
                <dt className="text-fg-muted">What</dt><dd className="break-words">{c.what}</dd>
                <dt className="text-fg-muted">Started</dt><dd className="tabular-nums">+{duration(Date.parse(c.startedAt) - t0)}</dd>
                <dt className="text-fg-muted">Took</dt><dd className="tabular-nums">{c.ms !== null ? duration(c.ms) : state === 'running' ? 'still running' : 'no result: the run ended first'}</dd>
                <dt className="text-fg-muted">By</dt><dd>{c.sub ? 'a sub-agent' : 'the agent'}</dd>
                {c.error && <><dt className="text-fail">Error</dt><dd className="break-words font-mono text-[11px] text-fail">{c.error}</dd></>}
              </dl>
            )}
          </li>
        );
      })}
    </ul>
  );
}
