// What the egress proxy lets through (ADR 0009). Pure: no config, no I/O, so the rule is tested on
// plain values. A host is allowed when the operator listed it (a name, or `*.name` for its
// subdomains), on the web ports only, and never when it resolves to an address inside a network.
import { isIP } from 'node:net';

export const parseAllow = (list: string | undefined) => String(list ?? '').split(/[\s,]+/).map((h) => h.trim().toLowerCase().replace(/\.$/, '')).filter(Boolean);

export function hostAllowed(host: string, allow: string[]) {
  const h = String(host ?? '').trim().toLowerCase().replace(/\.$/, '');
  if (!h || isIP(h)) return false; // a name only: an address would skip the list
  return allow.some((a) => (a.startsWith('*.') ? h.endsWith(a.slice(1)) && h.length > a.length - 1 : h === a));
}

export const portAllowed = (port: number) => port === 80 || port === 443;

// Loopback, private, link-local (the cloud metadata address) and other non-public ranges, v4 and v6.
export function isPrivateAddress(ip: string) {
  const v4 = ip.startsWith('::ffff:') ? ip.slice(7) : ip;
  if (isIP(v4) === 4) {
    const [a, b] = v4.split('.').map(Number);
    return a === 0 || a === 10 || a === 127 || (a === 100 && b >= 64 && b <= 127) || (a === 169 && b === 254) || (a === 172 && b >= 16 && b <= 31) || (a === 192 && b === 168) || a >= 224;
  }
  const v6 = ip.toLowerCase();
  return v6 === '::' || v6 === '::1' || v6.startsWith('fc') || v6.startsWith('fd') || /^fe[89ab]/.test(v6);
}

// The target of a CONNECT: "host:port", the port 443 when absent. Null when it is not one.
export function connectTarget(text: string) {
  const m = /^(?:\[([^\]]+)\]|([^:\s/]+))(?::(\d{1,5}))?$/.exec(String(text ?? '').trim());
  return m ? { host: m[1] ?? m[2], port: m[3] ? Number(m[3]) : 443 } : null;
}

// The target of a plain HTTP request, an absolute `http://` URL: https is only reached by CONNECT.
export function urlTarget(text: string) {
  try {
    const url = new URL(text);
    return url.protocol === 'http:' ? { host: url.hostname.replace(/^\[|\]$/g, ''), port: Number(url.port) || 80 } : null;
  } catch {
    return null;
  }
}
