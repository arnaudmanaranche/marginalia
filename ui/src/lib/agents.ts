import type { FoundFinding, RunStage, RunTrace, StageUsage, ToolCallRecord } from './api';
import type { Span } from './trace';

// A run's agents, the way an agent monitor shows them: each stage that ran Claude is one agent at
// work, with its model, what it cost, every tool call it made (timed, with how it went) and the one
// it is on. Pure: the clock comes in as `now`.

export interface Agent {
  id: string;
  label: string;
  state: RunStage['state'];
  startedAt: string | null;
  endedAt: string | null;
  usage: StageUsage | null;
  calls: ToolCallRecord[];
  current: ToolCallRecord | null;
  // The latest words of the agent while it thinks between calls.
  step: string | null;
  failedCalls: number;
  tools: string[];
}

export function agentsOf(trace: RunTrace): Agent[] {
  const calls = trace.calls ?? [];
  return trace.stages
    .filter((s) => trace.usage?.[s.id] || calls.some((c) => c.stage === s.id))
    .map((s) => {
      const mine = calls.filter((c) => c.stage === s.id);
      const open = mine.filter((c) => c.ok === null && !c.endedAt);
      const steps = trace.steps.filter((x) => x.stage === s.id && !x.tool);
      return {
        id: s.id, label: s.label, state: s.state, startedAt: s.startedAt, endedAt: s.endedAt,
        usage: trace.usage?.[s.id] ?? null,
        calls: mine,
        current: s.state === 'running' ? open.at(-1) ?? null : null,
        step: s.state === 'running' ? steps.at(-1)?.text ?? null : null,
        failedCalls: mine.filter((c) => c.ok === false).length,
        tools: [...new Set(mine.map((c) => c.tool))],
      };
    });
}

// A call's state as a span of the design system: running, failed, done, or cut off (the run ended
// before its result).
export const callState = (c: ToolCallRecord, running: boolean): Span['state'] => (
  c.ok === true ? 'done' : c.ok === false ? 'failed' : running ? 'running' : 'skipped'
);

// Each call as a span on the agent's own clock (ms from its start), for the time strip.
export function callSpans(agent: Agent, now: number): { spans: Span[]; total: number } {
  const t0 = Date.parse(agent.startedAt ?? agent.calls[0]?.startedAt ?? new Date(now).toISOString());
  const end = agent.endedAt ? Date.parse(agent.endedAt) : now;
  const running = agent.state === 'running';
  const spans = agent.calls.map((c) => ({
    id: c.id, label: `${c.tool} · ${c.what}`, state: callState(c, running),
    start: Date.parse(c.startedAt) - t0, end: (c.endedAt ? Date.parse(c.endedAt) : running ? now : end) - t0,
  }));
  return { spans, total: Math.max(1, end - t0, ...spans.map((s) => s.end)) };
}

// Tokens the way a person reads them: 950, 12.4k, 1.2M.
export function tokens(n: number): string {
  if (n < 1000) return String(n);
  if (n < 1_000_000) return `${(n / 1000).toFixed(n < 10_000 ? 1 : 0)}k`;
  return `${(n / 1_000_000).toFixed(1)}M`;
}

// A staged review's chapter reviewers, the way a verification swarm is shown: one row each with its
// state and how far it got, and what they found, newest first. Empty for a run without chapters.
export interface Swarm { agents: Agent[]; found: FoundFinding[] }

export function swarmOf(trace: RunTrace): Swarm {
  const chapters = new Set(trace.stages.filter((s) => s.id.startsWith('chapter-')).map((s) => s.id));
  if (!chapters.size) return { agents: [], found: [] };
  const agents = agentsOf(trace).filter((a) => chapters.has(a.id));
  // A chapter that has not started has no agent yet: it still counts as a row, waiting.
  const waiting = trace.stages.filter((s) => chapters.has(s.id) && !agents.some((a) => a.id === s.id)).map((s): Agent => ({
    id: s.id, label: s.label, state: s.state, startedAt: s.startedAt, endedAt: s.endedAt, usage: null, calls: [], current: null, step: null, failedCalls: 0, tools: [],
  }));
  const order = trace.stages.map((s) => s.id);
  return {
    agents: [...agents, ...waiting].sort((a, b) => order.indexOf(a.id) - order.indexOf(b.id)),
    found: [...(trace.found ?? [])].filter((f) => chapters.has(f.stage)).reverse(),
  };
}
