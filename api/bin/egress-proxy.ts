#!/usr/bin/env node
// The egress proxy of the verification runners (ADR 0009): the only thing a runner can reach, on a
// Docker network that has no route out except through it. It tunnels HTTPS (CONNECT) and forwards
// HTTP for the hosts in EGRESS_ALLOW, on ports 80 and 443, and refuses the rest with a 403, and any
// name that resolves into a private or link-local range. It sees host names, never a body it could
// change. `node dist/bin/egress-proxy.js`; EGRESS_PORT defaults to 3128.
import { createServer, request as httpRequest } from 'node:http';
import { lookup } from 'node:dns/promises';
import { connect } from 'node:net';
import { hostAllowed, isPrivateAddress, connectTarget, parseAllow, portAllowed, urlTarget } from '../src/egress-policy.ts';

const allow = parseAllow(process.env.EGRESS_ALLOW);
const port = Number(process.env.EGRESS_PORT) || 3128;
if (!allow.length) console.error('EGRESS_ALLOW is empty: every request will be refused.');

// The address to connect to, or null when the host or port is not allowed.
async function resolve(t: { host: string; port: number } | null) {
  if (!t || !hostAllowed(t.host, allow) || !portAllowed(t.port)) return null;
  const addrs = await lookup(t.host, { all: true }).catch(() => []);
  return addrs.length && !addrs.some((a) => isPrivateAddress(a.address)) ? addrs[0].address : null;
}

const server = createServer(async (req, res) => {
  const t = urlTarget(req.url ?? '');
  const ip = await resolve(t);
  if (!t || !ip) { res.writeHead(403).end(`egress refused: ${t?.host ?? 'bad request'}\n`); return; }
  const url = new URL(req.url!);
  const out = httpRequest({ host: ip, port: t.port, path: url.pathname + url.search, method: req.method, headers: { ...req.headers, host: url.host } }, (up) => {
    res.writeHead(up.statusCode ?? 502, up.headers);
    up.pipe(res);
  });
  out.on('error', () => res.headersSent || res.writeHead(502).end());
  req.pipe(out);
});

server.on('connect', async (req, client, head) => {
  const t = connectTarget(req.url ?? '');
  const ip = await resolve(t);
  if (!t || !ip) { client.end('HTTP/1.1 403 Forbidden\r\n\r\n'); return; }
  const up = connect(t.port, ip, () => {
    client.write('HTTP/1.1 200 Connection Established\r\n\r\n');
    up.write(head);
    up.pipe(client);
    client.pipe(up);
  });
  const stop = () => { up.destroy(); client.destroy(); };
  up.on('error', stop);
  client.on('error', stop);
});

server.listen(port, '0.0.0.0', () => console.error(`egress proxy on :${port}, allowing ${allow.join(', ') || 'nothing'}`));
