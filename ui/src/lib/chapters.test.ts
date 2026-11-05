import { describe, expect, it } from 'vitest';
import type { Finding, TourStop } from './api';
import { chapterSummary } from './chapters';

const f = (id: string, severity: Finding['severity']) => ({ id, severity } as Finding);
const stop = (findingIds: string[], threadIds?: string[]) => ({ id: 's', title: 't', summary: null, files: [], findingIds, threadIds } as TourStop);

describe('a chapter in the rail', () => {
  it('counts its findings and names the worst severity among them', () => {
    expect(chapterSummary(stop(['a', 'b', 'c']), [f('a', 'suggestion'), f('b', 'important'), f('c', 'info'), f('z', 'critical')])).toEqual({ count: 3, top: 'important', threads: 0 });
  });
  it('has no severity without findings, and counts the threads it answers', () => {
    expect(chapterSummary(stop([], ['t1', 't2']), [f('a', 'critical')])).toEqual({ count: 0, top: null, threads: 2 });
  });
});
