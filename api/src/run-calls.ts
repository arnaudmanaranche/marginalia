import type { ToolCall } from './tool-calls.ts';

// What a run's trace keeps of its Claude calls beside its steps (run-trace.ts): every tool call,
// timed and with its outcome, under the stage that made it, and what each stage's calls used
// (model, tokens, cost, time). Pure: the tracker (run-tracker.ts) stamps and stores.

// A run keeps this many tool calls: a runaway run must not grow its file without end.
export const MAX_CALLS = 1500;

export type StageCall = ToolCall & { stage: string | null };

export interface StageUsage {
  model: string | null; calls: number; turns: number; usd: number; ms: number;
  inputTokens: number; outputTokens: number; cacheReadTokens: number; cacheWriteTokens: number;
}

// `stats`: one Claude call's numbers, as claude-cli.ts parses them.
export interface CallStats {
  costUsd: number; turns: number; outputTokens: number; inputTokens?: number;
  cacheReadTokens?: number; cacheWriteTokens?: number; durationMs?: number | null; model?: string | null;
}

// A call that starts is added; the same call ending replaces it.
export function recordCall(trace: any, call: ToolCall, stage: string | null) {
  const calls: StageCall[] = trace.calls ?? [];
  const at = calls.findIndex((c) => c.id === call.id);
  if (at >= 0) return { ...trace, calls: calls.map((c, i) => (i === at ? { ...call, stage: c.stage } : c)) };
  if (calls.length >= MAX_CALLS) return { ...trace, droppedCalls: (trace.droppedCalls ?? 0) + 1 };
  return { ...trace, calls: [...calls, { ...call, stage }] };
}

// Adds one Claude call's numbers to its stage's.
export function addUsage(trace: any, stage: string, stats: CallStats) {
  const was: StageUsage = trace.usage?.[stage] ?? { model: null, calls: 0, turns: 0, usd: 0, ms: 0, inputTokens: 0, outputTokens: 0, cacheReadTokens: 0, cacheWriteTokens: 0 };
  const now: StageUsage = {
    model: stats.model ?? was.model, calls: was.calls + 1, turns: was.turns + stats.turns, usd: was.usd + stats.costUsd,
    ms: was.ms + (stats.durationMs ?? 0), inputTokens: was.inputTokens + (stats.inputTokens ?? 0), outputTokens: was.outputTokens + stats.outputTokens,
    cacheReadTokens: was.cacheReadTokens + (stats.cacheReadTokens ?? 0), cacheWriteTokens: was.cacheWriteTokens + (stats.cacheWriteTokens ?? 0),
  };
  return { ...trace, usage: { ...(trace.usage ?? {}), [stage]: now } };
}

// A run keeps this many findings as found: the feed of the studio, before the report weighs them.
export const MAX_FOUND = 500;

export interface Found { id: string; stage: string; severity: string; title: string; path: string | null; line: number | null; at: string }

// The findings one stage (a chapter's reviewer) gave, as it gave them, stamped with when.
export function recordFindings(trace: any, stage: string, findings: any[], at: string) {
  const was: Found[] = trace.found ?? [];
  const fresh = findings.slice(0, Math.max(0, MAX_FOUND - was.length)).map((f) => ({
    id: String(f.id ?? ''), stage, severity: String(f.severity ?? 'info'), title: String(f.title ?? ''),
    path: typeof f.path === 'string' ? f.path : null, line: Number.isInteger(f.line) ? f.line : null, at,
  }));
  return { ...trace, found: [...was, ...fresh] };
}
