import { describe, expect, it } from 'vitest';
import { criticalPathRoute, findingRoute, parseHash } from './hashRoute';

describe('hash route', () => {
  it('reads a page or a review', () => {
    expect(parseHash('')).toEqual({ slug: null, finding: null, path: null });
    expect(parseHash('#/settings')).toEqual({ slug: 'settings', finding: null, path: null });
    expect(parseHash('#/webapp/feat-x')).toEqual({ slug: 'webapp/feat-x', finding: null, path: null });
  });
  it('reads the finding a review opens on, whatever characters its id holds', () => {
    expect(parseHash(`#/${findingRoute('webapp/feat-x', 'a?b&c')}`)).toEqual({ slug: 'webapp/feat-x', finding: 'a?b&c', path: null });
  });
  it('reads the critical path a project context opens on', () => {
    expect(parseHash(`#/${criticalPathRoute('webapp', 'Checkout & payment')}`)).toEqual({ slug: 'context:webapp', finding: null, path: 'Checkout & payment' });
  });
  it('treats a malformed escape as no review', () => {
    expect(parseHash('#/%E0%A4')).toEqual({ slug: null, finding: null, path: null });
  });
});
