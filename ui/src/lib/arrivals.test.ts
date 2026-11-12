import { describe, expect, it } from 'vitest';
import { changesSince } from './arrivals';

describe('changesSince', () => {
  it('counts nothing on the first list', () => {
    expect(changesSince(null, [['a', '1'], ['b', '1']])).toEqual({ arrived: [], changed: [] });
  });
  it('tells what came in from what changed, and leaves the rest', () => {
    const known = new Map([['a', '1'], ['b', '1']]);
    expect(changesSince(known, [['c', '1'], ['a', '2'], ['b', '1']])).toEqual({ arrived: ['c'], changed: ['a'] });
  });
});
