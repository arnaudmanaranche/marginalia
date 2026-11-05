import { test } from 'node:test';
import assert from 'node:assert/strict';
import { MAX_CALLS, addUsage, recordCall } from '../dist/src/run-calls.js';
import { runSummary } from '../dist/src/run-trace.js';

const call = (over) => ({ id: 'a', tool: 'read', what: 'Reading a.ts', sub: false, startedAt: 't0', endedAt: null, ms: null, ok: null, error: null, ...over });

test('a call is kept under its stage when it starts, and replaced when it ends', () => {
  let trace = recordCall({}, call(), 'map');
  trace = recordCall(trace, call({ endedAt: 't1', ms: 900, ok: true }), 'other');
  assert.deepEqual(trace.calls.map((c) => [c.id, c.stage, c.ms, c.ok]), [['a', 'map', 900, true]]);
  assert.equal(runSummary({ ...trace, steps: [], droppedSteps: 0 }).calls, undefined);
});

test('past the limit, new calls are counted, not kept', () => {
  let trace = { calls: Array.from({ length: MAX_CALLS }, (_, i) => ({ ...call({ id: `c${i}` }), stage: null })) };
  trace = recordCall(trace, call({ id: 'late' }), null);
  assert.equal(trace.calls.length, MAX_CALLS);
  assert.equal(trace.droppedCalls, 1);
});

test('each stage adds up what its Claude calls used, and remembers the model', () => {
  let trace = addUsage({}, 'chapter-1', { costUsd: 0.1, turns: 3, outputTokens: 100, inputTokens: 10, cacheReadTokens: 500, durationMs: 4000, model: 'claude-x' });
  trace = addUsage(trace, 'chapter-1', { costUsd: 0.05, turns: 1, outputTokens: 20 });
  assert.deepEqual(trace.usage['chapter-1'], { model: 'claude-x', calls: 2, turns: 4, usd: 0.15000000000000002, ms: 4000, inputTokens: 10, outputTokens: 120, cacheReadTokens: 500, cacheWriteTokens: 0 });
});
