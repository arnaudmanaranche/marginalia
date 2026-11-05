import { describe, expect, it } from 'vitest';
import { newArrivals } from './arrivals';

describe('newArrivals', () => {
  it('counts nothing on the first list, then only what was not there', () => {
    expect(newArrivals(null, ['a', 'b'])).toEqual([]);
    expect(newArrivals(new Set(['a', 'b']), ['c', 'a', 'b'])).toEqual(['c']);
  });
});
