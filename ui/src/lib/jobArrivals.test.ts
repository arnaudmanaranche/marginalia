import { describe, expect, it } from 'vitest';
import type { Job } from './api';
import { newJobs } from './jobArrivals';

const job = (id: string) => ({ slug: 'p/a', id }) as Job;

describe('newJobs', () => {
  it('counts nothing as new on the first list', () => {
    expect(newJobs(null, [job('1')])).toEqual([]);
  });
  it('returns the jobs not seen before', () => {
    expect(newJobs(new Set(['p/a:1']), [job('2'), job('1')])).toEqual(['p/a:2']);
  });
});
