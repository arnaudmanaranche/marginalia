import { describe, expect, it } from 'vitest';
import { sharedTitle } from './screenTransition';

describe('sharedTitle', () => {
  it('carries the review opened from Home, and the one left on the way back', () => {
    expect(sharedTitle(null, 'webapp/feat-x')).toBe('webapp/feat-x');
    expect(sharedTitle('webapp/feat-x', null)).toBe('webapp/feat-x');
  });
  it('carries the review when going to it from any page', () => {
    expect(sharedTitle('approvals', 'webapp/feat-x')).toBe('webapp/feat-x');
  });
  it('carries nothing between pages, and does not move within one review', () => {
    expect(sharedTitle(null, 'settings')).toBeNull();
    expect(sharedTitle('context:webapp', 'approvals')).toBeNull();
    expect(sharedTitle('webapp/feat-x', 'webapp/feat-x')).toBeUndefined();
  });
});
