import { test } from 'node:test';
import assert from 'node:assert/strict';
import { createCallTracker } from '../dist/src/tool-calls.js';

const use = (id, name, input, parent = null) => ({ type: 'assistant', parent_tool_use_id: parent, message: { content: [{ type: 'tool_use', id, name, input }] } });
const result = (id, content, isError = false) => ({ type: 'user', message: { content: [{ type: 'tool_result', tool_use_id: id, content, is_error: isError }] } });

test('a tool call is paired with its result: how long it took and whether it worked', () => {
  let t = Date.parse('2026-11-05T10:00:00Z');
  const tracker = createCallTracker(() => t);
  const [started] = tracker.feed(use('a', 'Read', { file_path: '/repo/src/app.ts' }));
  assert.deepEqual({ ...started, startedAt: undefined }, { id: 'a', tool: 'read', what: 'Reading app.ts', sub: false, startedAt: undefined, endedAt: null, ms: null, ok: null, error: null });
  tracker.feed(use('b', 'Bash', { command: 'git diff main' }, 'agent-1'));
  t += 1500;
  const [ended] = tracker.feed(result('a', 'file text'));
  assert.equal(ended.ms, 1500);
  assert.equal(ended.ok, true);
  t += 500;
  const [failed] = tracker.feed(result('b', [{ type: 'text', text: 'fatal: bad revision\nmore' }], true));
  assert.equal(failed.ok, false);
  assert.equal(failed.error, 'fatal: bad revision');
  assert.equal(failed.sub, true);
  assert.equal(failed.tool, 'git');
  assert.equal(failed.ms, 2000);
});

test('a result for an unknown call, text and other events change nothing; an open call stays open', () => {
  const tracker = createCallTracker(() => 0);
  assert.deepEqual(tracker.feed(result('nope', 'x')), []);
  assert.deepEqual(tracker.feed({ type: 'assistant', message: { content: [{ type: 'text', text: 'hi' }] } }), []);
  assert.deepEqual(tracker.feed({ type: 'result' }), []);
  tracker.feed(use('c', 'Grep', { pattern: 'x' }));
  assert.deepEqual(tracker.calls().map((c) => [c.id, c.ok]), [['c', null]]);
});
