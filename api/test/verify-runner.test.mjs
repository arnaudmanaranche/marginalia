import { test } from 'node:test';
import assert from 'node:assert/strict';
import { mkdtemp, readFile, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { assertSafeMount, commandAllowed, execArgs, runArgs, truncateOutput } from '../dist/src/verify-runner-args.js';
import { startRunner } from '../dist/src/verify-runner.js';
import { DEFAULT_LIMITS } from '../dist/src/verify-limits.js';

const base = { name: 'r1', image: 'img', workdir: '/tmp/copy', limits: DEFAULT_LIMITS, user: '1000:1000' };
const flag = (args, f) => args[args.indexOf(f) + 1];

test('a runner always has its limits, a read-only root, no capability and no network', () => {
  const a = runArgs(base);
  assert.equal(flag(a, '--cpus'), '2');
  assert.equal(flag(a, '--memory'), '4096m');
  assert.equal(flag(a, '--memory-swap'), '4096m', 'no swap beyond the memory');
  assert.equal(flag(a, '--pids-limit'), '256');
  assert.ok(a.includes('--read-only') && a.includes('--rm'));
  assert.equal(flag(a, '--cap-drop'), 'ALL');
  assert.equal(flag(a, '--security-opt'), 'no-new-privileges:true');
  assert.equal(flag(a, '--network'), 'none');
  assert.deepEqual(a.filter((x, i) => a[i - 1] === '-v'), ['/tmp/copy:/work:rw'], 'one mount: the copy');
  assert.ok(!a.some((x) => /--privileged|--network=host|docker\.sock|\.claude/.test(x)));
});

test('named hosts need the operator\'s egress network; without it the runner stays offline', () => {
  assert.equal(flag(runArgs({ ...base, hosts: ['registry.example.org'] }), '--network'), 'none');
  const a = runArgs({ ...base, hosts: ['registry.example.org'], egress: { network: 'verify-egress', proxy: 'http://proxy:3128' } });
  assert.equal(flag(a, '--network'), 'verify-egress');
  assert.ok(a.includes('HTTPS_PROXY=http://proxy:3128'));
  assert.equal(flag(runArgs({ ...base, egress: { network: 'verify-egress', proxy: 'http://proxy:3128' } }), '--network'), 'none', 'a recipe with no host gets no network at all');
});

test('the bot\'s own folders are never mounted, nor a parent of them', () => {
  assert.throws(() => assertSafeMount('/data', ['/data']), /may not mount/);
  assert.throws(() => assertSafeMount('/data/worktrees/x', ['/data']), /may not mount/);
  assert.throws(() => assertSafeMount('/', ['/data']), /may not mount/);
  assert.equal(assertSafeMount('/work/copy', ['/data', '']), '/work/copy');
  assert.throws(() => runArgs({ ...base, workdir: '/home/me/.claude', forbidden: ['/home/me/.claude'] }), /may not mount/);
});

test('a command is a recipe step with arguments, and never chains or redirects', () => {
  const steps = [{ run: 'run the tests' }, { run: 'start it' }];
  assert.ok(commandAllowed(steps, 'run the tests'));
  assert.ok(commandAllowed(steps, 'run the tests path/to/file'));
  assert.ok(!commandAllowed(steps, 'run the testsXYZ'));
  for (const bad of ['run the tests; rm -rf /', 'run the tests && id', 'run the tests | sh', 'run the tests $(id)', 'run the tests > out', 'cat /etc/passwd', '', 'run the tests\nid']) assert.ok(!commandAllowed(steps, bad), bad);
  assert.deepEqual(execArgs('r1', 'x'), ['exec', '-w', '/work', 'r1', 'sh', '-c', 'x']);
});

test('a long output keeps its start and its end and says what was cut', () => {
  const t = truncateOutput('a'.repeat(100) + 'b'.repeat(100), 40);
  assert.ok(t.startsWith('aaaaaaaaaa') && t.endsWith('b'.repeat(30)));
  assert.match(t, /160 characters left out/);
  assert.equal(truncateOutput('short', 40), 'short');
});

async function fake() {
  const dir = await mkdtemp(join(tmpdir(), 'fake-docker-'));
  process.env.FAKE_DOCKER_LOG = join(dir, 'log');
  await writeFile(process.env.FAKE_DOCKER_LOG, '');
  const calls = async () => (await readFile(process.env.FAKE_DOCKER_LOG, 'utf8')).trim().split('\n').filter(Boolean).map((l) => JSON.parse(l));
  return { calls, docker: new URL('./fixtures/fake-docker.mjs', import.meta.url).pathname };
}
const steps = [{ run: 'ok' }, { run: 'fail' }, { run: 'big' }, { run: 'sleep' }];

test('a runner runs approved commands, refuses the others and is removed at the end', async () => {
  const { calls, docker } = await fake();
  const r = await startRunner({ image: 'img', workdir: '/tmp/copy-a', limits: DEFAULT_LIMITS, steps, docker });
  assert.deepEqual(await r.exec('ok'), { code: 0, output: 'ok\n', timedOut: false });
  const failed = await r.exec('fail');
  assert.equal(failed.code, 2);
  assert.match(failed.output, /boom/);
  assert.match((await r.exec('big')).output, /characters left out/);
  const refused = await r.exec('id');
  assert.equal(refused.code, 126);
  await r.stop();
  const all = await calls();
  assert.equal(all[0][0], 'run');
  assert.equal(all.filter((c) => c[0] === 'exec').length, 3, 'a refused command never reaches docker');
  assert.equal(all.at(-1)[0], 'rm');
});

test('a verification that runs out of time has its container removed', async () => {
  const { calls, docker } = await fake();
  const r = await startRunner({ image: 'img', workdir: '/tmp/copy-b', limits: { ...DEFAULT_LIMITS, timeoutMinutes: 0.02 }, steps, docker });
  const out = await r.exec('sleep');
  assert.equal(out.timedOut, true);
  assert.equal((await calls()).at(-1)[0], 'rm');
  assert.equal((await r.exec('ok')).timedOut, true, 'nothing runs after the time is up');
});

test('no image is a clear error, and no container starts', async () => {
  const { calls, docker } = await fake();
  await assert.rejects(startRunner({ image: '', workdir: '/tmp/c', limits: DEFAULT_LIMITS, steps, docker }), /VERIFY_RUNNER_IMAGE/);
  assert.equal((await calls()).length, 0);
});
