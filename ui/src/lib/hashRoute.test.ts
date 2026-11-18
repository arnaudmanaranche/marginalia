import { describe, expect, it } from 'vitest';
import { APPROVALS_ROUTE, JOBS_ROUTE, SETTINGS_ROUTE, contextRoute, criticalPathRoute, findingRoute, hrefOf, isReviewRoute, parseHash, versionRoute } from './hashRoute';

describe('hash route', () => {
  it('reads a page or a review', () => {
    expect(parseHash('')).toEqual({ slug: null, finding: null, path: null, version: null });
    expect(parseHash('#/settings')).toEqual({ slug: 'settings', finding: null, path: null, version: null });
    expect(parseHash('#/webapp/feat-x')).toEqual({ slug: 'webapp/feat-x', finding: null, path: null, version: null });
  });
  it('reads the finding a review opens on, whatever characters its id holds', () => {
    expect(parseHash(`#/${findingRoute('webapp/feat-x', 'a?b&c')}`)).toEqual({ slug: 'webapp/feat-x', finding: 'a?b&c', path: null, version: null });
  });
  it('reads the critical path a project context opens on', () => {
    expect(parseHash(`#/${criticalPathRoute('webapp', 'Checkout & payment')}`)).toEqual({ slug: 'context:webapp', finding: null, path: 'Checkout & payment', version: null });
  });
  it('reads the earlier version of a review on screen', () => {
    expect(parseHash(`#/${versionRoute('webapp/feat-x', '2026-10-27T15-37-29-269Z')}`)).toEqual({ slug: 'webapp/feat-x', finding: null, path: null, version: '2026-10-27T15-37-29-269Z' });
    expect(versionRoute('webapp/feat-x', null)).toBe('webapp/feat-x');
  });
  it('treats a malformed escape as no review', () => {
    expect(parseHash('#/%E0%A4')).toEqual({ slug: null, finding: null, path: null, version: null });
  });
});

describe('isReviewRoute and hrefOf', () => {
  it('a review slug is a review; the pages and no route are not', () => {
    expect(isReviewRoute('back/feat-x')).toBe(true);
    for (const page of [SETTINGS_ROUTE, APPROVALS_ROUTE, JOBS_ROUTE, contextRoute('webapp'), null]) expect(isReviewRoute(page)).toBe(false);
  });
  it('a link to no route is Home', () => {
    expect(hrefOf(null)).toBe('#/');
    expect(hrefOf('back/feat-x')).toBe('#/back/feat-x');
  });
});
