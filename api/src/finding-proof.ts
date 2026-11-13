// What a finding says about being provable (ADR 0009): `proof` is the reviewer's label (runtime:
// a claim about behaviour that running something could reproduce; static: a pattern or a rule,
// never run), `verification` is what a reproduction found. Pure: no config, no I/O.
import { clip, plain, str } from './findings-text.ts';

export const PROOFS = ['runtime', 'static'];
export const REPRODUCTIONS = ['reproduced', 'not_reproduced', 'inconclusive', 'skipped'];

export function normalizeProof(raw: unknown) {
  const value = String(raw ?? '').trim().toLowerCase();
  return PROOFS.includes(value) ? value : undefined;
}

// { status, evidence, command } or undefined. A status that is not one of the four is dropped:
// better no claim than an invented one.
export function normalizeVerification(raw: any) {
  const status = String(raw?.status ?? '').trim().toLowerCase().replace(/[\s-]+/g, '_');
  if (!REPRODUCTIONS.includes(status)) return undefined;
  const evidence = str(raw.evidence ?? raw.output ?? raw.reason, 4000);
  const command = str(raw.command, 600);
  const artifacts = normalizeArtifacts(raw.artifacts);
  return { status, evidence: evidence ? clip(plain(evidence), 1500) : null, command: command ? clip(command, 300) : null, ...(artifacts && { artifacts }) };
}

// The evidence a browser reproduction kept (ADR 0010): a kind, a plain file name and the API path it is
// served at. Anything else is dropped, so a stored review cannot point the studio anywhere else.
const KINDS = ['screenshot', 'log', 'trace'];
export function normalizeArtifacts(raw: unknown) {
  if (!Array.isArray(raw)) return undefined;
  const list = raw.filter((a: any) => KINDS.includes(a?.kind) && /^[\w.-]{1,80}$/.test(a?.name) && /^\/api\/evidence\/[\w-]{1,120}\/[\w.-]{1,80}$/.test(a?.ref))
    .slice(0, 8).map((a: any) => ({ kind: a.kind, name: a.name, ref: a.ref }));
  return list.length ? list : undefined;
}
