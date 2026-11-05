import { test } from 'node:test';
import assert from 'node:assert/strict';
import { aiEvents } from '../dist/src/ai-events.js';
import { captureAi } from '../dist/src/ai-observability.js';

const tc = (over) => ({ id: 'x', tool: 'read', what: 'Reading a.ts', sub: false, startedAt: '2026-11-05T10:00:01Z', endedAt: '2026-11-05T10:00:02Z', ms: 1000, ok: true, error: null, ...over });
const call = (over = {}) => ({
  traceId: 'run-1', name: 'correctness', kind: 'review', project: 'webapp', reviewer: 'me', model: 'claude-x', at: '2026-11-05T10:00:00Z',
  result: { usage: { input_tokens: 10, output_tokens: 5 }, total_cost_usd: 0.2, duration_ms: 3000, num_turns: 4, session_id: 's1', result: 'the answer' },
  failed: false, calls: [tc({ id: 'a', tool: 'read' }), tc({ id: 'b', tool: 'grep', ok: false, error: 'secret path /x', ms: 500 })], prompt: 'the prompt', systemPrompt: 'the system', includeContent: false, ...over,
});

test('a call is one generation in the job trace, with a timed span per tool call under it', () => {
  const [gen, ...spans] = aiEvents(call());
  assert.equal(gen.event, '$ai_generation');
  assert.equal(gen.properties.$ai_trace_id, 'run-1');
  assert.equal(gen.properties.$ai_parent_id, 'run-1');
  assert.equal(gen.properties.$ai_latency, 3);
  assert.equal(gen.properties.$ai_total_cost_usd, 0.2);
  assert.equal(gen.properties.marginalia_tool_errors, 1);
  assert.equal(spans.length, 2);
  assert.deepEqual(spans.map((s) => s.properties.$ai_span_name), ['read', 'grep']);
  assert.ok(spans.every((s) => s.properties.$ai_parent_id === gen.properties.$ai_span_id));
  assert.deepEqual(spans.map((s) => s.properties.$ai_latency), [1, 0.5]);
  assert.deepEqual(spans.map((s) => s.properties.$ai_is_error), [undefined, true]);
  assert.equal(spans[0].timestamp, '2026-11-05T10:00:01Z');
});

test('a failed tool says it failed, never what it said', () => {
  assert.equal(JSON.stringify(aiEvents(call())).includes('secret path'), false);
  assert.equal(JSON.stringify(aiEvents(call())).includes('Reading a.ts'), false);
});

test('prompt and answer leave only when content is on', () => {
  assert.equal(JSON.stringify(aiEvents(call())).includes('the prompt'), false);
  assert.equal(JSON.stringify(aiEvents(call())).includes('the answer'), false);
  const [gen] = aiEvents(call({ includeContent: true }));
  assert.equal(gen.properties.$ai_input[1].content, 'the prompt');
  assert.equal(gen.properties.$ai_output_choices[0].content, 'the answer');
});

test('model falls back, failure is marked, ids are stable', () => {
  const [gen] = aiEvents(call({ model: null, failed: true, error: 'x exited with code 1' }));
  assert.equal(gen.properties.$ai_model, 'claude-code');
  assert.equal(gen.properties.$ai_is_error, true);
  assert.equal(gen.properties.$ai_output_choices, undefined);
  assert.equal(aiEvents(call())[0].uuid, aiEvents(call())[0].uuid);
});

test('captureAi never throws and does nothing without config', () => {
  const saved = { ...process.env };
  delete process.env.POSTHOG_KEY;
  assert.doesNotThrow(() => captureAi({ ctx: { name: 'x' }, args: [], model: null, result: null, calls: [], failed: false }));
  process.env.POSTHOG_KEY = 'k'; process.env.POSTHOG_HOST = 'http://127.0.0.1:1'; process.env.MARGINALIA_TELEMETRY = 'off';
  assert.doesNotThrow(() => captureAi({ ctx: { name: 'x' }, args: ['-p', 'a'], model: null, result: {}, calls: [], failed: true, error: 'e' }));
  process.env = saved;
});
