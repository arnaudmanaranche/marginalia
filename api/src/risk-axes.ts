// The five questions behind a risk level, so "high" says why and what would lower it. Pure: no
// config, no I/O; the map stage and the findings reader both use it.
import { clip, plain, str } from './findings-text.ts';

export const RISK_AXES = ['verification', 'alignment', 'impact', 'rollback', 'detection'];

// { axis, level, note }, one per axis at most, in the fixed order; anything else is dropped.
export function normalizeAxes(raw: any) {
  if (!Array.isArray(raw)) return [];
  const byAxis = new Map<string, any>();
  for (const a of raw) {
    const axis = String(a?.axis ?? '').trim().toLowerCase();
    const level = String(a?.level ?? '').trim().toLowerCase();
    if (!RISK_AXES.includes(axis) || !['low', 'medium', 'high'].includes(level) || byAxis.has(axis)) continue;
    const note = str(a.note ?? a.why ?? a.rationale, 600);
    byAxis.set(axis, { axis, level, note: note ? clip(plain(note), 240) : null });
  }
  return RISK_AXES.filter((x) => byAxis.has(x)).map((x) => byAxis.get(x));
}

// What would lower the risk: a few short lines.
export function normalizeMitigations(raw: any) {
  return (Array.isArray(raw) ? raw : []).map((m: any) => str(m, 300)).filter(Boolean).map((m: any) => clip(plain(m), 200)).slice(0, 5);
}

// The level of the whole is never lower than its worst axis.
export function atLeastWorst(level: string, axes: any[]) {
  const order = ['low', 'medium', 'high'];
  return axes.reduce((top, a) => (order.indexOf(a.level) > order.indexOf(top) ? a.level : top), level);
}
