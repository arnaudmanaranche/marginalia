import { describe, expect, it } from 'vitest';
import type { Finding } from './api';
import { bodyToShow, summaryWithoutRepeats } from './repeats';

const f = (o: Partial<Finding>) => ({ id: 'a', severity: 'important', title: 'T', body: 'T', ...o } as Finding);

describe('text that repeats', () => {
  it('drops a summary sentence a finding already states and keeps the rest', () => {
    const finding = f({ title: 'A re-check can lower the resolved count a second time', body: 'x' });
    const out = summaryWithoutRepeats('The hook re-checks expired batches. A re-check can lower the resolved count a second time.', [finding]);
    expect(out).toBe('The hook re-checks expired batches.');
  });
  it('has no summary left when everything is stated elsewhere', () => {
    expect(summaryWithoutRepeats('Same words here.', [f({ title: 'Same words here' })])).toBeNull();
  });
  it('shows the explanation, unless the comment already says it', () => {
    expect(bodyToShow(f({ title: 'Short', body: 'A longer reason about the cache key changing back and forth' }))).not.toBeNull();
    expect(bodyToShow(f({ title: 'Short', body: 'The cache key changes back and forth', comment: 'The cache key changes back and forth, please fix' }))).toBeNull();
    expect(bodyToShow(f({ title: 'Same', body: 'Same' }))).toBeNull();
  });
  it('keeps a real explanation that merely contains the words of its short title', () => {
    expect(bodyToShow(f({ title: 'Stale cache key', body: 'The stale cache key is rebuilt on every render because the config object changes identity, which refetches each time.' }))).not.toBeNull();
  });
  it('loses no word of a summary whose dots have no space after them', () => {
    const text = 'The handler.ts file reads it.\nSecond line, e.g. this one.';
    expect(summaryWithoutRepeats(text, [f({ title: 'Unrelated finding' })])).toBe(text);
  });
});
