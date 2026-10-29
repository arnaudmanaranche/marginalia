import { describe, expect, it } from 'vitest';
import type { Finding } from './api';
import { reportDelta } from './reportDelta';

const f = (id: string, title: string, path: string | null = 'src/Modal.tsx'): Finding => ({ id, severity: 'suggestion', title, path, line: null, body: '', comment: null });

describe('reportDelta', () => {
  it('matches findings by id first', () => {
    const d = reportDelta([f('a', 'One'), f('b', 'Two')], [f('a', 'One, reworded'), f('c', 'Three')]);
    expect(d.kept.map((x) => x.id)).toEqual(['a']);
    expect(d.added.map((x) => x.id)).toEqual(['c']);
    expect(d.gone.map((x) => x.id)).toEqual(['b']);
  });

  it('matches a reworded finding on the same file whose id changed', () => {
    const d = reportDelta([f('modal-overflow', 'Shared Modal loses its scroll container')], [f('F1', 'Modal scroll container lost on open')]);
    expect(d).toEqual({ added: [], kept: [expect.objectContaining({ id: 'F1' })], gone: [] });
  });

  it('does not match the same words on another file', () => {
    const d = reportDelta([f('x', 'Modal scroll container', 'a.ts')], [f('y', 'Modal scroll container', 'b.ts')]);
    expect([d.added.length, d.kept.length, d.gone.length]).toEqual([1, 0, 1]);
  });

  it('matches each earlier finding once', () => {
    const d = reportDelta([f('a', 'Double cast on suggestion')], [f('b', 'Double cast on suggestion'), f('c', 'Double cast on suggestion')]);
    expect([d.added.length, d.kept.length, d.gone.length]).toEqual([1, 1, 0]);
  });
});
