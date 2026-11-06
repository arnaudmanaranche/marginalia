import { test } from 'node:test';
import assert from 'node:assert/strict';
import { spawn } from 'node:child_process';
import { existsSync } from 'node:fs';
import { mkdir, mkdtemp, readFile, symlink, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { newFilePath } from '../dist/src/verify-files.js';
import { handleMessage, TOOL_NAMES } from '../dist/src/verify-mcp-protocol.js';
import { STAGE_VERIFY_TOOLS } from '../dist/src/allowed-tools.js';
import { DEFAULT_LIMITS } from '../dist/src/verify-limits.js';

test('a file is created at a relative path inside the project, never in .git or node_modules', () => {
  assert.deepEqual(newFilePath('src/repro/total.test.ts'), { ok: true, path: 'src/repro/total.test.ts' });
  for (const bad of ['', '/etc/passwd', '../x', 'a/../../x', 'a//b', './a', '.git/hooks/pre-commit', 'node_modules/x/index.js', '.claude/settings.json', 'a\\b', 'a b', 'x'.repeat(201)]) assert.equal(newFilePath(bad).ok, false, bad);
});

test('the verify tier has the read tools and the two runner tools, and nothing that runs or writes by itself', () => {
  assert.deepEqual(STAGE_VERIFY_TOOLS, ['Read', 'Grep', 'Glob', 'mcp__verify__run', 'mcp__verify__write_file']);
  assert.deepEqual(TOOL_NAMES, ['mcp__verify__run', 'mcp__verify__write_file']);
  assert.ok(!STAGE_VERIFY_TOOLS.some((t) => /^(Bash|Edit|Write|WebFetch|WebSearch|Task)/.test(t) || /atlassian|notion|slack|gitlab/i.test(t)));
});

const handlers = {
  run: async (c) => (c === 'bad' ? { code: 126, output: '', timedOut: false, refused: 'not a step' } : c === 'slow' ? { code: 124, output: 'part', timedOut: true } : { code: c === 'fail' ? 1 : 0, output: 'out', timedOut: false }),
  writeFile: async (p) => (p === 'dup' ? { ok: false, error: 'it already exists' } : { ok: true }),
};

test('the protocol answers initialize, lists the two tools, calls them and ignores notifications', async () => {
  const init = await handleMessage({ jsonrpc: '2.0', id: 1, method: 'initialize', params: { protocolVersion: '2025-06-18' } }, handlers);
  assert.equal(init.result.serverInfo.name, 'verify');
  assert.deepEqual(init.result.capabilities, { tools: {} });
  assert.equal(await handleMessage({ jsonrpc: '2.0', method: 'notifications/initialized' }, handlers), null);
  const list = await handleMessage({ jsonrpc: '2.0', id: 2, method: 'tools/list' }, handlers);
  assert.deepEqual(list.result.tools.map((t) => t.name), ['run', 'write_file']);
  const call = (name, args) => handleMessage({ jsonrpc: '2.0', id: 3, method: 'tools/call', params: { name, arguments: args } }, handlers);
  assert.equal((await call('run', { command: 'ok' })).result.content[0].text, 'exit code 0\nout');
  assert.match((await call('run', { command: 'bad' })).result.content[0].text, /Refused: not a step/);
  assert.equal((await call('run', { command: 'slow' })).result.isError, true);
  assert.match((await call('write_file', { path: 'dup', content: 'x' })).result.content[0].text, /Not created: it already exists/);
  assert.equal((await call('nope', {})).result.isError, true);
  assert.equal((await handleMessage({ jsonrpc: '2.0', id: 4, method: 'resources/list' }, handlers)).error.code, -32601);
  assert.equal((await handleMessage('x', handlers)).error.code, -32600);
});

// The server script, end to end: a client speaks MCP to it, the container is the scripted docker.
test('the tool server starts the runner on the first command, creates new files only and removes the container on exit', async () => {
  const dir = await mkdtemp(join(tmpdir(), 'verify-mcp-'));
  const workdir = join(dir, 'copy');
  await mkdir(workdir);
  await writeFile(join(workdir, 'existing.txt'), 'keep');
  await symlink(dir, join(workdir, 'escape'));
  const log = join(dir, 'docker.log');
  await writeFile(log, '');
  const cfg = join(dir, 'config.json');
  await writeFile(cfg, JSON.stringify({ image: 'img', workdir, limits: DEFAULT_LIMITS, steps: [{ run: 'ok' }], hosts: [], forbidden: [], docker: new URL('./fixtures/fake-docker.mjs', import.meta.url).pathname }));
  const child = spawn(process.execPath, [new URL('../dist/bin/verify-mcp.js', import.meta.url).pathname, cfg], { env: { ...process.env, FAKE_DOCKER_LOG: log } });
  const answers = [];
  let buf = '';
  child.stdout.on('data', (d) => { buf += d; let i; while ((i = buf.indexOf('\n')) >= 0) { answers.push(JSON.parse(buf.slice(0, i))); buf = buf.slice(i + 1); } });
  const ask = async (id, method, params) => {
    child.stdin.write(`${JSON.stringify({ jsonrpc: '2.0', id, method, params })}\n`);
    for (let n = 0; n < 200 && !answers.some((a) => a.id === id); n += 1) await new Promise((r) => setTimeout(r, 25));
    return answers.find((a) => a.id === id).result;
  };
  await ask(1, 'initialize', {});
  assert.equal((await readFile(log, 'utf8')).trim(), '', 'no container before the first command');
  assert.equal((await ask(2, 'tools/call', { name: 'write_file', arguments: { path: 'repro/a.test.txt', content: 'hello' } })).isError, false);
  assert.equal(await readFile(join(workdir, 'repro/a.test.txt'), 'utf8'), 'hello');
  assert.equal((await ask(3, 'tools/call', { name: 'write_file', arguments: { path: 'existing.txt', content: 'changed' } })).isError, true);
  assert.equal(await readFile(join(workdir, 'existing.txt'), 'utf8'), 'keep');
  assert.equal((await ask(4, 'tools/call', { name: 'write_file', arguments: { path: '../outside.txt', content: 'x' } })).isError, true);
  assert.equal(existsSync(join(dir, 'outside.txt')), false);
  assert.match((await ask(7, 'tools/call', { name: 'write_file', arguments: { path: 'escape/planted.txt', content: 'x' } })).content[0].text, /outside the project/);
  assert.equal(existsSync(join(dir, 'planted.txt')), false, 'a symlink does not lead a file out of the copy');
  assert.match((await ask(5, 'tools/call', { name: 'run', arguments: { command: 'ok' } })).content[0].text, /exit code 0\nok/);
  assert.match((await ask(6, 'tools/call', { name: 'run', arguments: { command: 'id' } })).content[0].text, /Refused/);
  child.stdin.end();
  await new Promise((r) => child.on('exit', r));
  const calls = (await readFile(log, 'utf8')).trim().split('\n').map((l) => JSON.parse(l));
  assert.deepEqual(calls.map((c) => c[0]), ['run', 'exec', 'rm']);
});
