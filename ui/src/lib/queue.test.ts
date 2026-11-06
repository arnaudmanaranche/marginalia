import { describe, expect, it } from 'vitest';
import { depthSeries, estimateOf, lineOf, measuresOf, median, progressOf, ranMs, waitedMs, type QueueTask, type QueueView } from './queue';

const T0 = Date.parse('2026-11-05T10:00:00.000Z');
const at = (s: number) => new Date(T0 + s * 1000).toISOString();
const task = (over: Partial<QueueTask> = {}): QueueTask => ({
  id: 'x', kind: 'poll', project: null, label: 'Poll the open MRs', priority: 'normal', status: 'queued',
  enqueuedAt: at(0), startedAt: null, endedAt: null, attempt: 1, maxAttempts: 2, error: null, position: null, detail: null, jobs: [], ...over,
});

describe('the queue', () => {
  it('measures how long a task waited and ran', () => {
    const t = task({ startedAt: at(30), endedAt: at(90), status: 'done' });
    expect(waitedMs(t, T0 + 200_000)).toBe(30_000);
    expect(ranMs(t, T0 + 200_000)).toBe(60_000);
    expect(ranMs(task(), T0)).toBeNull();
    expect(waitedMs(task(), T0 + 5000)).toBe(5000);
  });
  it('takes the median, and a running bar never says done', () => {
    expect(median([3, 1, 2])).toBe(2);
    expect(median([1, 2, 3, 4])).toBe(2.5);
    expect(median([])).toBeNull();
    const done = [task({ id: 'a', status: 'done', startedAt: at(0), endedAt: at(100) }), task({ id: 'b', status: 'done', startedAt: at(0), endedAt: at(300) })];
    expect(estimateOf(done, 'poll', T0)).toBe(200_000);
    expect(progressOf(task({ status: 'running', startedAt: at(0) }), 200_000, T0 + 100_000)).toBe(0.5);
    expect(progressOf(task({ status: 'running', startedAt: at(0) }), 200_000, T0 + 900_000)).toBe(0.95);
    expect(progressOf(task({ status: 'running', startedAt: at(0) }), null, T0)).toBeNull();
  });
  it('counts what waits, the medians, the totals and what the jobs cost', () => {
    const view: QueueView = {
      now: at(100), workers: [], totals: { done: 7, failed: 1 }, budget: null,
      tasks: [
        task({ id: 'q' }),
        task({ id: 'r', status: 'running', startedAt: at(10), jobs: [{ slug: 'a/b', id: 'j', outcome: 'running', title: null, startedAt: at(11), endedAt: null, costUsd: 0.5 }] }),
        task({ id: 'd', status: 'done', startedAt: at(20), endedAt: at(60), jobs: [{ slug: 'a/c', id: 'k', outcome: 'reviewed', title: null, startedAt: at(21), endedAt: at(50), costUsd: 0.25 }] }),
      ],
    };
    expect(measuresOf(view, T0 + 100_000)).toEqual({ waiting: 1, running: 1, medianWait: 15_000, medianRun: 40_000, done: 7, failed: 1, costUsd: 0.75 });
  });
  it('draws the backlog over time, from enqueue to start', () => {
    const tasks = [task({ id: 'a', enqueuedAt: at(0), startedAt: at(50) }), task({ id: 'b', enqueuedAt: at(20) })];
    const series = depthSeries(tasks, T0 + 100_000, 100_000, 11);
    expect(series.map((p) => p.depth)).toEqual([1, 1, 2, 2, 2, 1, 1, 1, 1, 1, 0]);
  });
  it('reads the line in order: waiting by place, running, ended newest first', () => {
    const line = lineOf([
      task({ id: 'w2', position: 2 }), task({ id: 'w1', position: 1 }), task({ id: 'r', status: 'running' }),
      task({ id: 'e1', status: 'done', endedAt: at(10) }), task({ id: 'e2', status: 'failed', endedAt: at(20) }),
    ]);
    expect(line.waiting.map((t) => t.id)).toEqual(['w1', 'w2']);
    expect(line.running.map((t) => t.id)).toEqual(['r']);
    expect(line.ended.map((t) => t.id)).toEqual(['e2', 'e1']);
  });
});
