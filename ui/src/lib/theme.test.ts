import { describe, expect, it } from 'vitest';
import { parseChoice, resolveTheme } from './theme';

describe('the theme', () => {
  it('reads a kept choice, and anything else as following the system', () => {
    expect(parseChoice('dark')).toBe('dark');
    expect(parseChoice('light')).toBe('light');
    expect(parseChoice(null)).toBe('system');
    expect(parseChoice('purple')).toBe('system');
  });
  it('follows the system only while the choice says so', () => {
    expect(resolveTheme('system', true)).toBe('dark');
    expect(resolveTheme('system', false)).toBe('light');
    expect(resolveTheme('light', true)).toBe('light');
    expect(resolveTheme('dark', false)).toBe('dark');
  });
});
