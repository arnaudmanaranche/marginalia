import { test } from 'node:test';
import assert from 'node:assert/strict';
import { Writable } from 'node:stream';
import { createLogger, stripAnsi } from '../src/logger.mjs';

const sink = () => {
  const chunks = [];
  const stream = new Writable({ write(chunk, _encoding, done) { chunks.push(String(chunk)); done(); } });
  return Object.assign(stream, { chunks });
};

test('pretty lines carry the time, the level, the project and the MR, with no colour codes off a terminal', () => {
  const out = sink();
  const logger = createLogger({ destination: out, colorize: false });
  logger.child({ project: 'webapp', iid: 12 }).info('Starting review');
  const line = out.chunks.join('');
  assert.match(line, /^\[\d{4}-\d{2}-\d{2}T[\d:.]+Z\] INFO: \[webapp\] \[MR !12\] Starting review\n$/);
  assert.ok(!line.includes('\x1b['));
});

test('without an MR or project the line is just the message', () => {
  const out = sink();
  createLogger({ destination: out, colorize: false }).warn('Poll failed');
  assert.match(out.chunks.join(''), /WARN: Poll failed\n$/);
});

test('an error is printed with its stack under the message', () => {
  const out = sink();
  createLogger({ destination: out, colorize: false }).error({ err: new Error('boom') }, 'Review failed');
  const text = out.chunks.join('');
  assert.match(text, /Review failed/);
  assert.match(text, /Error: boom/);
  assert.match(text, /at /, 'the stack follows');
});

test('json mode writes one parseable object per event with the fields as keys', () => {
  const out = sink();
  createLogger({ json: true, destination: out }).child({ project: 'webapp', iid: 12 }).info('hello');
  const entry = JSON.parse(out.chunks.join(''));
  assert.equal(entry.msg, 'hello');
  assert.equal(entry.project, 'webapp');
  assert.equal(entry.iid, 12);
  assert.equal(entry.level, 30);
});

test('the level filters what is written', () => {
  const out = sink();
  const logger = createLogger({ json: true, destination: out, level: 'warn' });
  logger.info('quiet');
  logger.warn('loud');
  assert.deepEqual(out.chunks.map((c) => JSON.parse(c).msg), ['loud']);
});

test('stripAnsi removes colours and terminal hyperlinks', () => {
  assert.equal(stripAnsi('\x1b[31mred\x1b[0m'), 'red');
  assert.equal(stripAnsi('\x1b]8;;https://x.test/mr/1\x07!1\x1b]8;;\x07'), '!1');
});
