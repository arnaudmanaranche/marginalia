// What the docker guard lets a bot do to a Docker daemon (ADR 0009, hosted). The bot's container never
// holds the Docker socket: it talks to the guard, which forwards only the calls a verification
// needs, and a `create` only when the container it describes is a runner, with every limit and no
// way out of it. Pure: no config, no I/O, tested on plain values.
import { posix } from 'node:path';

export interface GuardConfig {
  image: string;
  volume: string;
  // Networks a runner may join besides `none`: the egress one.
  networks: string[];
  namePrefix?: string;
  maxMemoryMb?: number;
  maxCpus?: number;
  maxPids?: number;
}
export type Decision = { ok: true; track?: 'container' | 'exec' } | { ok: false; reason: string };
export interface Known { container: (ref: string) => boolean; exec: (id: string) => boolean }

const no = (reason: string): Decision => ({ ok: false, reason });
const PREFIX = 'marginalia-verify-';

// A value that asks for nothing: what the docker CLI sends for the options that were not given.
export function empty(v: any): boolean {
  if (v === null || v === undefined || v === '' || v === false || v === 0 || v === -1) return true;
  if (Array.isArray(v)) return v.every(empty);
  if (typeof v === 'object') return Object.values(v).every(empty);
  return false;
}

const TOP = new Set(['Hostname', 'Domainname', 'AttachStdin', 'AttachStdout', 'AttachStderr', 'Tty', 'OpenStdin', 'StdinOnce', 'Env', 'Cmd', 'Image', 'Volumes', 'WorkingDir', 'Entrypoint', 'Labels', 'User', 'HostConfig', 'NetworkingConfig']);
const HOST = new Set(['AutoRemove', 'ReadonlyRootfs', 'Tmpfs', 'CapDrop', 'SecurityOpt', 'NanoCpus', 'Memory', 'MemorySwap', 'PidsLimit', 'NetworkMode', 'Mounts', 'LogConfig', 'RestartPolicy']);
const TMPFS = new Set(['/tmp', '/home/runner']);

export function validateCreate(name: string | null, body: any, cfg: GuardConfig): Decision {
  const prefix = cfg.namePrefix ?? PREFIX;
  if (!name || !name.startsWith(prefix) || !/^[a-z0-9-]+$/.test(name)) return no(`a runner is named ${prefix}…`);
  if (!body || typeof body !== 'object') return no('no container description');
  for (const [k, v] of Object.entries(body)) if (!TOP.has(k) && !empty(v)) return no(`${k} is not allowed`);
  if (body.Image !== cfg.image) return no('not the runner image');
  if (!/^[1-9]\d*(:\d+)?$/.test(String(body.User ?? ''))) return no('a runner does not run as root');
  if (!empty(body.Entrypoint) || Object.keys(body.Volumes ?? {}).length) return no('no entrypoint or anonymous volume');
  if (Object.keys(body.NetworkingConfig?.EndpointsConfig ?? {}).length) return no('the network is NetworkMode');
  const h = body.HostConfig;
  if (!h || typeof h !== 'object') return no('no host configuration');
  for (const [k, v] of Object.entries(h)) if (!HOST.has(k) && !empty(v)) return no(`HostConfig.${k} is not allowed`);
  if (h.ReadonlyRootfs !== true) return no('the root must be read-only');
  if (!Array.isArray(h.CapDrop) || !h.CapDrop.includes('ALL')) return no('every capability must be dropped');
  const opts = h.SecurityOpt;
  if (!Array.isArray(opts) || !opts.length || !opts.every((o: any) => o === 'no-new-privileges' || o === 'no-new-privileges:true')) return no('only no-new-privileges is allowed');
  if (!['none', ...cfg.networks].includes(h.NetworkMode)) return no('the network is none or the egress network');
  const mb = (cfg.maxMemoryMb ?? 16384) * 1024 * 1024;
  if (!(h.Memory > 0 && h.Memory <= mb) || h.MemorySwap !== h.Memory) return no('a memory limit, with no swap');
  if (!(h.NanoCpus > 0 && h.NanoCpus <= (cfg.maxCpus ?? 8) * 1e9)) return no('a cpu limit');
  if (!(h.PidsLimit > 0 && h.PidsLimit <= (cfg.maxPids ?? 4096))) return no('a pids limit');
  if (!['', 'no', undefined].includes(h.RestartPolicy?.Name)) return no('no restart policy');
  if (!['', 'json-file', 'local', undefined].includes(h.LogConfig?.Type) || !empty(h.LogConfig?.Config)) return no('the default logging');
  if (Object.keys(h.Tmpfs ?? {}).some((t) => !TMPFS.has(t))) return no('tmpfs at /tmp and /home/runner only');
  const m = h.Mounts;
  const sub = m?.[0]?.VolumeOptions?.Subpath;
  if (!Array.isArray(m) || m.length !== 1 || m[0].Type !== 'volume' || m[0].Source !== cfg.volume || m[0].Target !== '/work') return no('one mount: a folder of the work volume at /work');
  if (typeof sub !== 'string' || !sub || posix.isAbsolute(sub) || sub.split('/').includes('..') || !empty({ ...m[0].VolumeOptions, Subpath: 0 }) || !empty({ ...m[0], Type: 0, Source: 0, Target: 0, VolumeOptions: 0 })) return no('a relative subfolder of the work volume');
  return { ok: true, track: 'container' };
}

function validateExec(body: any): Decision {
  const cmd = body?.Cmd;
  if (!Array.isArray(cmd) || cmd[0] !== 'sh' || cmd[1] !== '-c' || cmd.length !== 3) return no('a command is sh -c <command>');
  if (!empty(body.Privileged) || !empty(body.User) || body.Tty === true) return no('no privileged, user or tty exec');
  return { ok: true, track: 'exec' };
}

// method, path (with the API version and the query) and the parsed body of a request.
export function decide(method: string, url: string, body: any, cfg: GuardConfig, known: Known): Decision {
  const [rawPath, query = ''] = url.split('?');
  const path = rawPath.replace(/^\/v\d+(\.\d+)?/, '');
  const m = method.toUpperCase();
  if ((m === 'HEAD' || m === 'GET') && ['/_ping', '/version', '/info'].includes(path)) return { ok: true };
  const image = /^\/images\/(.+)\/json$/.exec(path);
  if (m === 'GET' && image) return decodeURIComponent(image[1]) === cfg.image ? { ok: true } : no('only the runner image');
  if (m === 'POST' && path === '/containers/create') return validateCreate(new URLSearchParams(query).get('name'), body, cfg);
  const c = /^\/containers\/([^/]+)(?:\/(start|wait|json|exec))?$/.exec(path);
  if (c) {
    if (!known.container(decodeURIComponent(c[1]))) return no('not a runner of this guard');
    const op = c[2] ?? 'delete';
    if (op === 'delete' && m === 'DELETE') return { ok: true };
    if (op === 'json' && m === 'GET') return { ok: true };
    if ((op === 'start' || op === 'wait') && m === 'POST') return { ok: true };
    if (op === 'exec' && m === 'POST') return validateExec(body);
    return no(`${m} ${path}`);
  }
  const e = /^\/exec\/([^/]+)\/(start|json|resize)$/.exec(path);
  if (e && known.exec(e[1]) && (e[2] === 'json' ? m === 'GET' : m === 'POST')) return { ok: true };
  return no(`${m} ${path} is not allowed`);
}
