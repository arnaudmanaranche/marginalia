import { describe, expect, it } from 'vitest';
import type { RunTrace, ToolCallRecord } from './api';
import { agentsOf, callSpans, callState, swarmOf, tokens } from './agents';

const T0 = Date.parse('2026-11-05T10:00:00.000Z');
const at = (s: number) => new Date(T0 + s * 1000).toISOString();
const call = (over: Partial<ToolCallRecord>): ToolCallRecord => ({ id: 'c', tool: 'read', what: 'Reading a.ts', sub: false, stage: 'map', startedAt: at(1), endedAt: at(2), ms: 1000, ok: true, error: null, ...over });
const trace = (over: Partial<RunTrace> = {}): RunTrace => ({
  id: 'r', slug: 'app/x', project: 'app', iid: 1, kind: 'review', command: 'marginalia', startedAt: at(0), endedAt: null, outcome: 'running',
  error: null, failure: null, stepCount: 0, cost: null, doctor: null, fix: null, fixSource: { available: false },
  stages: [
    { id: 'context', label: 'Gather', state: 'done', startedAt: at(0), endedAt: at(1) },
    { id: 'map', label: 'Map the change', state: 'running', startedAt: at(1), endedAt: null },
  ],
  steps: [{ at: at(3), text: 'I read the diff first.', stage: 'map', sub: false }],
  calls: [call({ id: 'a' }), call({ id: 'b', tool: 'git', ok: false, error: 'bad revision' }), call({ id: 'c', tool: 'grep', endedAt: null, ms: null, ok: null, startedAt: at(4) })],
  usage: { map: { model: 'claude-x', calls: 1, turns: 3, usd: 0.12, ms: 9000, inputTokens: 10, outputTokens: 900, cacheReadTokens: 12000, cacheWriteTokens: 0 } },
  ...over,
});

describe('the agents of a run', () => {
  it('are the stages that ran Claude, each with its calls, the one it is on and what failed', () => {
    const [map] = agentsOf(trace());
    expect(agentsOf(trace()).map((a) => a.id)).toEqual(['map']);
    expect(map.current?.id).toBe('c');
    expect(map.step).toBe('I read the diff first.');
    expect(map.failedCalls).toBe(1);
    expect(map.tools).toEqual(['read', 'git', 'grep']);
    expect(map.usage?.model).toBe('claude-x');
  });
  it('lay their calls on their own clock; a call cut off by the end of the run is not shown as running', () => {
    const [map] = agentsOf(trace());
    const { spans, total } = callSpans(map, T0 + 10_000);
    expect(spans.map((s) => [s.id, s.state, s.start, s.end])).toEqual([['a', 'done', 0, 1000], ['b', 'failed', 0, 1000], ['c', 'running', 3000, 9000]]);
    expect(total).toBe(9000);
    expect(callState(call({ ok: null, endedAt: null }), false)).toBe('skipped');
  });
  it('a run from before calls were kept has no agent', () => {
    expect(agentsOf(trace({ calls: undefined, usage: undefined }))).toEqual([]);
  });
  it('says tokens short', () => {
    expect([tokens(950), tokens(12_400), tokens(3_456), tokens(1_200_000)]).toEqual(['950', '12k', '3.5k', '1.2M']);
  });
});

describe('the chapter reviewers of a staged review', () => {
  it('are one row per chapter, waiting ones included, and their findings come newest first', () => {
    const t = trace({
      stages: [
        { id: 'map', label: 'Map', state: 'done', startedAt: at(0), endedAt: at(1) },
        { id: 'chapter-1', label: 'Review: A', state: 'done', startedAt: at(1), endedAt: at(5) },
        { id: 'chapter-2', label: 'Review: B', state: 'pending', startedAt: null, endedAt: null },
      ],
      calls: [call({ id: 'a', stage: 'chapter-1' })], usage: {},
      found: [
        { id: 'f1', stage: 'chapter-1', severity: 'critical', title: 'One', path: 'a.ts', line: 1, at: at(4) },
        { id: 'f2', stage: 'chapter-1', severity: 'info', title: 'Two', path: null, line: null, at: at(5) },
        { id: 'm', stage: 'map', severity: 'info', title: 'Not a chapter', path: null, line: null, at: at(1) },
      ],
    });
    const swarm = swarmOf(t);
    expect(swarm.agents.map((a) => [a.id, a.state, a.calls.length])).toEqual([['chapter-1', 'done', 1], ['chapter-2', 'pending', 0]]);
    expect(swarm.found.map((f) => f.id)).toEqual(['f2', 'f1']);
  });
  it('is nothing for a run without chapters', () => {
    expect(swarmOf(trace())).toEqual({ agents: [], found: [] });
  });
});
