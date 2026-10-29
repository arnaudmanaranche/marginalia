import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { inTime, timeAgo } from './utils';

const NOW = Date.parse('2026-01-01T12:00:00Z');
const at = (seconds: number) => new Date(NOW + seconds * 1000).toISOString();

beforeEach(() => vi.useFakeTimers({ now: NOW }));
afterEach(() => vi.useRealTimers());

describe('timeAgo', () => {
  it('says how long ago, in the coarsest useful unit', () => {
    expect(timeAgo(at(-30))).toBe('30s ago');
    expect(timeAgo(at(-5 * 60))).toBe('5 min ago');
    expect(timeAgo(at(-3 * 3600))).toBe('3h ago');
    expect(timeAgo(at(-2 * 86400))).toBe('2d ago');
  });
  it('shows a question mark without a date', () => {
    expect(timeAgo(null)).toBe('?');
  });
});

describe('inTime', () => {
  it('says how long until', () => {
    expect(inTime(at(20))).toBe('in 20s');
    expect(inTime(at(10 * 60))).toBe('in 10 min');
    expect(inTime(at(-1))).toBe('any moment');
    expect(inTime(null)).toBe('');
  });
});
