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

test('a chapter\'s findings are kept as it gave them, stamped, up to the limit', async () => {
  const { recordFindings, MAX_FOUND } = await import('../dist/src/run-calls.js');
  let trace = recordFindings({}, 'chapter-1', [{ id: 'a', severity: 'critical', title: 'T', path: 'x.ts', line: 3, body: 'kept out' }, { id: 'b', title: 'U', line: 'nope' }], 't1');
  assert.deepEqual(trace.found, [
    { id: 'a', stage: 'chapter-1', severity: 'critical', title: 'T', path: 'x.ts', line: 3, at: 't1' },
    { id: 'b', stage: 'chapter-1', severity: 'info', title: 'U', path: null, line: null, at: 't1' },
  ]);
  trace = recordFindings({ found: Array.from({ length: MAX_FOUND - 1 }, () => ({})) }, 'chapter-2', [{ id: 'c' }, { id: 'd' }], 't2');
  assert.equal(trace.found.length, MAX_FOUND);
  assert.equal(trace.found.at(-1).id, 'c');
});
