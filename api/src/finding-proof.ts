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
  return { status, evidence: evidence ? clip(plain(evidence), 1500) : null, command: command ? clip(command, 300) : null };
}
