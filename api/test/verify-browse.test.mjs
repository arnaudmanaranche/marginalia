import { test } from 'node:test';
import assert from 'node:assert/strict';
import { browseStep, urlAllowed, runStep } from '../dist/src/verify-browse.js';
import { execArgv, runArgs } from '../dist/src/verify-runner-args.js';
import { DEFAULT_LIMITS } from '../dist/src/verify-limits.js';

test('a page opens only on localhost or a host the recipe names, parsed as a URL', () => {
  assert.ok(urlAllowed('http://localhost:3000/a'));
  assert.ok(urlAllowed('http://127.0.0.1:8080'));
  assert.ok(urlAllowed('https://staging.example.com/x', ['*.example.com']));
  assert.ok(!urlAllowed('https://evil.com'));
  assert.ok(!urlAllowed('http://localhost@evil.com/'));
  assert.ok(!urlAllowed('file:///etc/passwd'));
  assert.ok(!urlAllowed('javascript:alert(1)'));
  assert.ok(!urlAllowed('http://localhost.evil.com'));
  assert.ok(!urlAllowed('http://user:pw@localhost'));
});

test('a step is one argv: no flags from the agent, no free action', () => {
  assert.deepEqual(browseStep({ action: 'open', target: 'http://localhost:3000' }).argv, ['open', 'http://localhost:3000']);
  assert.deepEqual(browseStep({ action: 'fill', target: '@e2', value: 'hello' }).argv, ['fill', '@e2', 'hello']);
  assert.equal(browseStep({ action: 'click', target: '--executable-path' }).ok, false);
  assert.equal(browseStep({ action: 'fill', target: '@e1', value: '-x' }).ok, false);
  assert.equal(browseStep({ action: 'eval', target: 'x' }).ok, false);
  assert.equal(browseStep({ action: 'open', target: 'https://evil.com' }).ok, false);
  assert.equal(browseStep({ action: 'click' }).ok, false);
});

test('the project is started by the recipe\'s run step, if it has one', () => {
  assert.equal(runStep([{ purpose: 'setup', run: 'x' }, { purpose: 'run', run: 'serve' }]), 'serve');
  assert.equal(runStep([{ purpose: 'test', run: 't' }]), null);
});

test('the browse argv goes to docker without a shell, and the home is the runner user\'s', () => {
  assert.deepEqual(execArgv('c', ['agent-browser', 'open', 'http://localhost']).slice(-3), ['agent-browser', 'open', 'http://localhost']);
  assert.ok(!execArgv('c', ['a']).includes('sh'));
  const args = runArgs({ name: 'n', image: 'i', workdir: '/w', limits: DEFAULT_LIMITS, user: '1001:1002' });
  assert.ok(args.includes('/home/runner:rw,size=512m,uid=1001,gid=1002'));
  assert.ok(args.includes('--cap-drop') && args.includes('--read-only') && args.includes('none'));
});

test('evidence: only the names the browse tool writes are served, refs are plain API paths', async () => {
  const { evidenceType, evidenceRef, evidenceId } = await import('../dist/src/verify-evidence.js');
  const { normalizeVerification } = await import('../dist/src/finding-proof.js');
  assert.equal(evidenceType('screenshot.png'), 'image/png');
  assert.equal(evidenceType('console.txt'), 'text/plain; charset=utf-8');
  for (const bad of ['../x.png', 'a.html', 'a.svg', 'evidence.json', 'x/y.png']) assert.equal(evidenceType(bad), null);
  const id = evidenceId('run 1', 'verify-1');
  const ok = { kind: 'screenshot', name: 'screenshot.png', ref: evidenceRef(id, 'screenshot.png') };
  const v = normalizeVerification({ status: 'reproduced', evidence: 'x', artifacts: [ok, { kind: 'log', name: 'a.txt', ref: 'https://evil.com/a.txt' }, { kind: 'script', name: 'a.js', ref: ok.ref }] });
  assert.deepEqual(v.artifacts, [ok]);
});

test('doctor: a recipe with a browser needs agent-browser in the runner image', async () => {
  const { verifyChecks } = await import('../dist/src/verify-checks.js');
  const recipe = { steps: [{}], browser: { url: 'http://localhost:3000' } };
  const base = { image: 'img', docker: { stdout: '27\n' }, imageProbe: {}, recipe, egress: null };
  assert.equal(verifyChecks({ ...base, browserProbe: {} }).find((c) => c.label === 'Browser').level, 'ok');
  assert.equal(verifyChecks({ ...base, browserProbe: { error: 'exit 1' } }).find((c) => c.label === 'Browser').level, 'warn');
  assert.ok(!verifyChecks({ ...base, recipe: { steps: [{}] } }).some((c) => c.label === 'Browser'));
});
