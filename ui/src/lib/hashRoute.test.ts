import { describe, expect, it } from 'vitest';
import { findingRoute, parseHash } from './hashRoute';

describe('hash route', () => {
  it('reads a page or a review', () => {
    expect(parseHash('')).toEqual({ slug: null, finding: null });
    expect(parseHash('#/settings')).toEqual({ slug: 'settings', finding: null });
    expect(parseHash('#/webapp/feat-x')).toEqual({ slug: 'webapp/feat-x', finding: null });
  });
  it('reads the finding a review opens on, whatever characters its id holds', () => {
    expect(parseHash(`#/${findingRoute('webapp/feat-x', 'a?b&c')}`)).toEqual({ slug: 'webapp/feat-x', finding: 'a?b&c' });
  });
  it('treats a malformed escape as no review', () => {
    expect(parseHash('#/%E0%A4')).toEqual({ slug: null, finding: null });
  });
});
