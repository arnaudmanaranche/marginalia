import { describe, expect, it } from 'vitest';
import { commentTargetAt, squash, writtenComment } from './reviewComments';

describe('squash', () => {
  it('compares text without markdown, case or spacing', () => {
    expect(squash('Use **`foo`**, please!')).toBe(squash('use foo please'));
  });
});

describe('writtenComment', () => {
  const source = 'intro\n> first\n> second\n\nafter';
  it('reads the blockquote that starts at the offset', () => {
    expect(writtenComment(source, source.indexOf('> first'))).toBe('first\nsecond');
  });
  it('is null without an offset or an empty quote', () => {
    expect(writtenComment(source, undefined)).toBeNull();
    expect(writtenComment(source, source.indexOf('after'))).toBeNull();
  });
});

describe('commentTargetAt', () => {
  it('finds the file and line the bullet above the comment names', () => {
    const source = '## Critical\n- `src/a/b.ts:12` leaks\n> fix it';
    expect(commentTargetAt(source, source.indexOf('> fix'))).toEqual({ path: 'src/a/b.ts', line: 12 });
  });
  it('is null without an offset', () => {
    expect(commentTargetAt('x', undefined)).toBeNull();
  });
});
