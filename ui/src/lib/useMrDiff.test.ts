import { describe, expect, it } from 'vitest';
import { diffStateOf } from './useMrDiff';

const files = [{ path: 'a.ts' }] as never;

describe('diffStateOf', () => {
  it('is idle without a review to read the MR from', () => {
    expect(diffStateOf(null, { error: null, isFetching: false })).toEqual({ status: 'idle' });
  });
  it('is loading until something answers', () => {
    expect(diffStateOf('p/a', { error: null, isFetching: true })).toEqual({ status: 'loading' });
  });
  it('is ready with the files, approximate only when the server said so', () => {
    expect(diffStateOf('p/a', { data: { files }, error: null, isFetching: false })).toEqual({ status: 'ready', files, approximate: false });
    expect(diffStateOf('p/a', { data: { files, approximate: true }, error: null, isFetching: false })).toMatchObject({ approximate: true });
  });
  it('shows the failure, and loading again while it is retried', () => {
    const error = new Error('boom');
    expect(diffStateOf('p/a', { error, isFetching: false })).toEqual({ status: 'error', message: 'boom' });
    expect(diffStateOf('p/a', { error, isFetching: true })).toEqual({ status: 'loading' });
  });
});
