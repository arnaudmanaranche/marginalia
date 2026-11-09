// The docker guard in front of a fake daemon on a unix socket: what is allowed reaches the daemon,
// what is not never does, the ids of the runners and execs it saw created are the only ones it
// forwards, and the exec's upgraded connection carries the command's output.
import { test, after } from 'node:test';
import assert from 'node:assert/strict';
import { createServer, request } from 'node:http';
import { connect } from 'node:net';
import { mkdtemp } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { createGuard } from '../dist/src/docker-guard-server.js';

const dir = await mkdtemp(join(tmpdir(), 'guard-'));
const sock = join(dir, 'docker.sock');
const seen = [];
const daemon = createServer((req, res) => {
  let b = ''; req.on('data', (d) => (b += d)); req.on('end', () => {
    seen.push(`${req.method} ${req.url}`);
    if (req.url.includes('/containers/create')) return res.writeHead(201, { 'content-type': 'application/json' }).end('{"Id":"abc123def4567890","Warnings":[]}');
    if (req.url.includes('/wait')) { res.writeHead(200, { 'content-type': 'application/json' }); res.flushHeaders(); return void setTimeout(() => res.end('{"StatusCode":0}'), 600); }
    if (req.url.endsWith('/exec')) return res.writeHead(201, { 'content-type': 'application/json' }).end('{"Id":"ex1"}');
    res.writeHead(204).end();
  });
});
daemon.on('upgrade', (req, socket) => {
  seen.push(`UPGRADE ${req.url}`);
  socket.write('HTTP/1.1 101 UPGRADED\r\nContent-Type: application/vnd.docker.raw-stream\r\nConnection: Upgrade\r\nUpgrade: tcp\r\n\r\nhello from the runner\n');
  socket.end();
});
await new Promise((r) => daemon.listen(sock, r));
const logs = [];
const guard = createGuard({ image: 'marginalia-runner', volume: 'work', networks: [] }, sock, (l) => logs.push(l));
await new Promise((r) => guard.listen(0, '127.0.0.1', r));
const port = guard.address().port;
after(() => { guard.close(); daemon.close(); });

const call = (method, path, body) => new Promise((resolve, reject) => {
  const data = body === undefined ? null : JSON.stringify(body);
  const req = request({ host: '127.0.0.1', port, method, path, headers: data ? { 'content-type': 'application/json', 'content-length': Buffer.byteLength(data) } : {} }, (res) => {
    let t = ''; res.on('data', (d) => (t += d)); res.on('end', () => resolve({ status: res.statusCode, text: t }));
  });
  req.on('error', reject);
  req.end(data);
});

const runner = () => ({
  User: '1000:1000', Env: [], Cmd: ['sleep', 'infinity'], Image: 'marginalia-runner', Volumes: {}, WorkingDir: '/work', Entrypoint: null,
  HostConfig: { Binds: null, NetworkMode: 'none', ReadonlyRootfs: true, CapDrop: ['ALL'], SecurityOpt: ['no-new-privileges:true'], Memory: 4294967296, MemorySwap: 4294967296, NanoCpus: 2e9, PidsLimit: 256, Tmpfs: { '/tmp': 'rw' }, Mounts: [{ Type: 'volume', Source: 'work', Target: '/work', VolumeOptions: { Subpath: 'd/project' } }] },
  NetworkingConfig: { EndpointsConfig: {} },
});

test('a runner is created, started and removed through the guard; anything else is refused before the daemon', async () => {
  assert.equal((await call('POST', '/v1.56/containers/create?name=marginalia-verify-t1', runner())).status, 201);
  assert.equal((await call('POST', '/v1.56/containers/abc123def4567890/start')).status, 204, 'by the id the daemon gave');
  assert.equal((await call('POST', '/v1.56/containers/abc123def456/wait?condition=removed')).status, 200, 'by its short id');
  assert.equal((await call('DELETE', '/v1.56/containers/marginalia-verify-t1?force=1')).status, 204);
  const before = seen.length;

  const evil = runner(); evil.HostConfig.Privileged = true;
  assert.equal((await call('POST', '/containers/create?name=marginalia-verify-t2', evil)).status, 403);
  const bind = runner(); bind.HostConfig.Mounts = [{ Type: 'bind', Source: '/', Target: '/work' }];
  assert.equal((await call('POST', '/containers/create?name=marginalia-verify-t3', bind)).status, 403);
  assert.equal((await call('POST', '/containers/the-database/start')).status, 403);
  assert.equal((await call('DELETE', '/containers/the-database?force=1')).status, 403);
  assert.equal((await call('GET', '/containers/json')).status, 403);
  assert.equal((await call('POST', '/images/create?fromImage=evil')).status, 403);
  assert.equal(seen.length, before, 'none of them reached the daemon');
  assert.ok(logs.some((l) => /refused POST .*Privileged/.test(l)));
});

test('an exec in a runner is created, then its upgraded connection carries the output; an exec nobody created is refused', async () => {
  assert.equal((await call('POST', '/containers/create?name=marginalia-verify-t4', runner())).status, 201);
  assert.equal((await call('POST', '/containers/abc123def4567890/exec', { Cmd: ['sh', '-c', 'id'], Privileged: true })).status, 403);
  const made = await call('POST', '/containers/abc123def4567890/exec', { Cmd: ['sh', '-c', 'node --test'], AttachStdout: true });
  assert.equal(made.status, 201);
  const start = (id) => new Promise((resolve) => {
    const s = connect(port, '127.0.0.1', () => s.write(`POST /exec/${id}/start HTTP/1.1\r\nHost: x\r\nConnection: Upgrade\r\nUpgrade: tcp\r\nContent-Type: application/json\r\nContent-Length: 2\r\n\r\n{}`));
    let t = ''; s.on('data', (d) => (t += d)); s.on('close', () => resolve(t));
  });
  assert.match(await start('ex1'), /101 UPGRADED[\s\S]*hello from the runner/);
  assert.match(await start('someone-elses'), /^HTTP\/1\.1 403/);
  assert.ok(seen.includes('UPGRADE /exec/ex1/start') && !seen.some((s) => s.includes('someone-elses')));
});

test('a long `wait` answers its headers at once: the docker CLI starts the container only after them', async () => {
  const t0 = Date.now();
  const headersAt = await new Promise((resolve, reject) => {
    const r = request({ host: '127.0.0.1', port, method: 'POST', path: '/containers/abc123def4567890/wait?condition=removed' }, (res) => { resolve(Date.now() - t0); res.resume(); });
    r.on('error', reject);
    r.end();
  });
  assert.ok(headersAt < 400, `the headers came after ${headersAt} ms, with the body`);
});
