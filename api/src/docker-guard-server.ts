// The docker guard's server (ADR 0009, hosted): an HTTP proxy in front of the Docker daemon's socket
// that forwards a request only when docker-guard-policy.ts allows it, and remembers the runners and
// execs it saw created so that nothing else of the daemon can be started, entered or removed. No
// config import: bin/docker-guard.ts reads the environment and hands it over.
import { createServer, request as httpRequest, type IncomingMessage, type Server } from 'node:http';
import { connect } from 'node:net';
import { decide, type GuardConfig } from './docker-guard-policy.ts';

const MAX_BODY = 1_000_000;
const PREFIX = 'marginalia-verify-';

function readBody(req: IncomingMessage): Promise<Buffer | null> {
  return new Promise((resolve) => {
    const parts: Buffer[] = [];
    let size = 0;
    req.on('data', (d: Buffer) => { size += d.length; if (size <= MAX_BODY) parts.push(d); });
    req.on('end', () => resolve(size <= MAX_BODY ? Buffer.concat(parts) : null));
    req.on('error', () => resolve(null));
  });
}

export function createGuard(cfg: GuardConfig, upstream: string, log: (line: string) => void = () => {}): Server {
  const containers = new Set<string>();
  const execs = new Set<string>();
  const known = {
    container: (ref: string) => ref.startsWith(cfg.namePrefix ?? PREFIX) || containers.has(ref),
    exec: (id: string) => execs.has(id),
  };
  const refuse = (res: any, reason: string, req: IncomingMessage) => {
    log(`refused ${req.method} ${req.url}: ${reason}`);
    res.writeHead(403, { 'content-type': 'application/json' }).end(JSON.stringify({ message: `docker guard: ${reason}` }));
  };

  const server = createServer(async (req, res) => {
    const raw = await readBody(req);
    if (raw === null) return refuse(res, 'request body too large', req);
    let body: any = null;
    if (raw.length) { try { body = JSON.parse(raw.toString('utf8')); } catch { return refuse(res, 'body is not JSON', req); } }
    const d = decide(req.method ?? 'GET', req.url ?? '/', body, cfg, known);
    if (!d.ok) return refuse(res, d.reason, req);
    const out = httpRequest({ socketPath: upstream, method: req.method, path: req.url, headers: { ...req.headers, connection: 'close' } }, (up) => {
      const headers = up.headers;
      if (!d.track || up.statusCode !== 201) {
        res.writeHead(up.statusCode ?? 502, headers);
        // Sent now, not with the first byte: a `wait` answers its headers at once and its body at the end.
        res.flushHeaders();
        up.pipe(res);
        return;
      }
      const chunks: Buffer[] = [];
      up.on('data', (c: Buffer) => chunks.push(c));
      up.on('end', () => {
        const text = Buffer.concat(chunks);
        try {
          const id = String(JSON.parse(text.toString('utf8')).Id ?? '');
          if (id && d.track === 'container') { containers.add(id); containers.add(id.slice(0, 12)); }
          if (id && d.track === 'exec') execs.add(id);
        } catch { /* the daemon answered something else: nothing to remember */ }
        res.writeHead(up.statusCode!, headers).end(text);
      });
    });
    out.on('error', () => { if (!res.headersSent) res.writeHead(502).end(); else res.destroy(); });
    out.end(raw);
  });

  // `docker exec` asks for the connection to be upgraded to carry the command's output.
  server.on('upgrade', (req, socket, head) => {
    const d = decide(req.method ?? 'POST', req.url ?? '/', {}, cfg, known);
    if (!d.ok || d.track) {
      log(`refused ${req.method} ${req.url}: ${d.ok ? 'no upgrade for a create' : d.reason}`);
      socket.end('HTTP/1.1 403 Forbidden\r\nConnection: close\r\n\r\n');
      return;
    }
    const up = connect(upstream, () => {
      up.write(`${req.method} ${req.url} HTTP/1.1\r\n${req.rawHeaders.reduce((s, h, i) => s + (i % 2 ? `${h}\r\n` : `${h}: `), '')}\r\n`);
      up.write(head);
      up.pipe(socket);
      socket.pipe(up);
    });
    const stop = () => { up.destroy(); socket.destroy(); };
    up.on('error', stop);
    socket.on('error', stop);
  });
  return server;
}
