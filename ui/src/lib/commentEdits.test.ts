// @vitest-environment jsdom
import { afterEach, describe, expect, it, vi } from 'vitest';
import { editKey, readEdit, writeEdit } from './commentEdits';

afterEach(() => localStorage.clear());

describe('commentEdits', () => {
  it('keys an edit by the original text, the same way every time', () => {
    expect(editKey('abc')).toBe(editKey('abc'));
    expect(editKey('abc')).not.toBe(editKey('abd'));
    expect(editKey('abc')).toMatch(/^mr-review-viewer:edit:/);
  });

  it('writes, reads and clears an edit', () => {
    const key = editKey('original');
    expect(readEdit(key)).toBeNull();
    writeEdit(key, 'mine');
    expect(readEdit(key)).toBe('mine');
    writeEdit(key, null);
    expect(readEdit(key)).toBeNull();
  });

  it('works without localStorage', () => {
    vi.spyOn(Storage.prototype, 'getItem').mockImplementation(() => {
      throw new Error('blocked');
    });
    vi.spyOn(Storage.prototype, 'setItem').mockImplementation(() => {
      throw new Error('blocked');
    });
    expect(readEdit('k')).toBeNull();
    expect(() => writeEdit('k', 'v')).not.toThrow();
  });
});
