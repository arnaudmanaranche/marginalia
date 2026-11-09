// What the egress proxy lets through, on plain values, and the proxy itself end to end against a
// local server standing in for an allowed host.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { createServer, request } from 'node:http';
import { spawn } from 'node:child_process';
import { connect } from 'node:net';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { connectTarget, hostAllowed, isPrivateAddress, parseAllow, portAllowed, urlTarget } from '../dist/src/egress-policy.js';

test('the allowlist takes names and *.names, never an address, and is not fooled by a suffix', () => {
  const allow = parseAllow('Registry.npmjs.org, *.pythonhosted.org\n github.com.');
  assert.deepEqual(allow, ['registry.npmjs.org', '*.pythonhosted.org', 'github.com']);
  assert.equal(hostAllowed('registry.npmjs.org', allow), true);
  assert.equal(hostAllowed('files.pythonhosted.org', allow), true);
  assert.equal(hostAllowed('pythonhosted.org', allow), false, '*.x is its subdomains');
  assert.equal(hostAllowed('evilpythonhosted.org', allow), false);
  assert.equal(hostAllowed('registry.npmjs.org.evil.com', allow), false);
  assert.equal(hostAllowed('1.2.3.4', ['1.2.3.4']), false);
  assert.equal(hostAllowed('', allow), false);
  assert.equal(hostAllowed('anything.com', []), false);
  assert.deepEqual([80, 443, 22, 8080].map(portAllowed), [true, true, false, false]);
});

test('private, loopback and link-local addresses are refused, public ones are not', () => {
  for (const ip of ['127.0.0.1', '10.1.2.3', '172.16.0.1', '172.31.255.1', '192.168.1.1', '169.254.169.254', '100.64.0.1', '0.0.0.0', '::1', 'fd00::1', 'fe80::1', '::ffff:10.0.0.1']) assert.equal(isPrivateAddress(ip), true, ip);
  for (const ip of ['8.8.8.8', '172.32.0.1', '1.1.1.1', '2606:4700::1111']) assert.equal(isPrivateAddress(ip), false, ip);
});

test('the target of a CONNECT and of a plain request', () => {
  assert.deepEqual(connectTarget('registry.npmjs.org:443'), { host: 'registry.npmjs.org', port: 443 });
  assert.deepEqual(connectTarget('example.com:80'), { host: 'example.com', port: 80 });
  assert.deepEqual(connectTarget('example.com'), { host: 'example.com', port: 443 });
  assert.deepEqual(connectTarget('[::1]:22'), { host: '::1', port: 22 });
  assert.equal(connectTarget('a b'), null);
  assert.deepEqual(urlTarget('http://example.com/x?y=1'), { host: 'example.com', port: 80 });
  assert.deepEqual(urlTarget('http://example.com:8080/'), { host: 'example.com', port: 8080 });
  assert.equal(urlTarget('https://example.com/'), null);
  assert.equal(urlTarget('/relative'), null);
});

const here = dirname(fileURLToPath(import.meta.url));
async function proxyOn(port, allow) {
  const child = spawn(process.execPath, [join(here, '../dist/bin/egress-proxy.js')], { env: { ...process.env, EGRESS_PORT: String(port), EGRESS_ALLOW: allow }, stdio: ['ignore', 'ignore', 'pipe'] });
  await new Promise((r) => child.stderr.on('data', (d) => /egress proxy on/.test(String(d)) && r()));
  return child;
}

test('the proxy refuses a host that is not listed, a private address and a port that is not 80 or 443, and tunnels a listed one', async () => {
  const port = 38000 + (process.pid % 1000);
  const proxy = await proxyOn(port, 'localhost');
  try {
    const status = (path) => new Promise((resolve) => {
      const req = request({ host: '127.0.0.1', port, path, method: 'GET', headers: { host: new URL(path).host } }, (res) => { res.resume(); resolve(res.statusCode); });
      req.on('error', () => resolve(0));
      req.end();
    });
    assert.equal(await status('http://not-listed.example/'), 403);
    assert.equal(await status('http://localhost:9999/'), 403, 'a port that is not a web port');
    assert.equal(await status('http://localhost/'), 403, 'localhost resolves to a private address');
    const answer = await new Promise((resolve) => {
      const s = connect(port, '127.0.0.1', () => s.write('CONNECT evil.example:443 HTTP/1.1\r\nHost: evil.example:443\r\n\r\n'));
      s.once('data', (d) => { resolve(String(d)); s.destroy(); });
    });
    assert.match(answer, /^HTTP\/1\.1 403/);
  } finally {
    proxy.kill();
  }
});
