import { describe, expect, it } from 'vitest';
import { depthSeries, estimateOf, isQuiet, lineOf, measuresOf, median, progressOf, ranMs, waitedMs, type QueueTask, type QueueView } from './queue';
import { forecastOf, usualRunOf } from './queueForecast';

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
  it('counts what waits, the medians, what ended among the tasks shown and what the jobs cost', () => {
    const view: QueueView = {
      now: at(100), workers: [], totals: { done: 7, failed: 1 }, budget: null,
      tasks: [
        task({ id: 'q' }),
        task({ id: 'r', status: 'running', startedAt: at(10), jobs: [{ slug: 'a/b', id: 'j', outcome: 'running', title: null, startedAt: at(11), endedAt: null, costUsd: 0.5 }] }),
        task({ id: 'd', status: 'done', startedAt: at(20), endedAt: at(60), jobs: [{ slug: 'a/c', id: 'k', outcome: 'reviewed', title: null, startedAt: at(21), endedAt: at(50), costUsd: 0.25 }] }),
      ],
    };
    expect(measuresOf(view, T0 + 100_000)).toEqual({ waiting: 1, running: 1, medianWait: 15_000, medianRun: 40_000, done: 1, failed: 0, costUsd: 0.75 });
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

describe('what comes next', () => {
  const view = (tasks: QueueTask[], workers = 1): QueueView => ({
    now: at(0), tasks, totals: { done: 0, failed: 0 }, budget: null,
    workers: Array.from({ length: workers }, (_, i) => ({ id: `w${i}`, name: `Worker ${i}`, detail: null, taskId: null })),
  });
  const quietPoll = (id: string, s: number) => task({ id, status: 'done', enqueuedAt: at(s), startedAt: at(s), endedAt: at(s + 2) });
  const worked = (id: string, s: number, len: number) => task({ ...quietPoll(id, s), endedAt: at(s + len), jobs: [{ slug: 'a/b', id, outcome: 'reviewed', title: null, startedAt: at(s), endedAt: at(s + len), costUsd: 0.1 }] });

  it('folds the polls that found nothing, and only those', () => {
    expect(isQuiet(quietPoll('q', 0))).toBe(true);
    expect(isQuiet(worked('w', 0, 60))).toBe(false);
    expect(isQuiet(task({ status: 'failed' }))).toBe(false);
    expect(isQuiet(task({ status: 'done', attempt: 2 }))).toBe(false);
  });
  it('measures a running task against the tasks that did something, not the quiet polls', () => {
    const tasks = [quietPoll('q1', -900), quietPoll('q2', -800), worked('w', -700, 600), task({ id: 'r', status: 'running', startedAt: at(-100) })];
    expect(usualRunOf(tasks, 'poll', T0)).toBe(600_000);
    expect(forecastOf(view(tasks), T0).slots.get('r')).toEqual({ start: T0 - 100_000, end: T0 + 500_000, known: true });
  });
  it('says nothing sure of a task already past its usual time, nor of what waits behind it', () => {
    const tasks = [worked('w', -900, 60), task({ id: 'r', status: 'running', startedAt: at(-300) }), task({ id: 'q', position: 1 })];
    const f = forecastOf(view(tasks), T0);
    expect(f.slots.get('r')?.known).toBe(false);
    expect(f.slots.get('q')?.known).toBe(false);
  });
  it('starts a waiting task on the first free worker, after its own project is free', () => {
    const tasks = [
      worked('w', -900, 100), task({ id: 'r', project: 'a', status: 'running', startedAt: at(-40) }),
      task({ id: 'qa', project: 'a', position: 1 }), task({ id: 'qb', project: 'b', position: 2 }),
    ];
    const f = forecastOf(view(tasks, 2), T0);
    expect(f.slots.get('qa')?.start).toBe(T0 + 60_000);
    expect(f.slots.get('qb')?.start).toBe(T0);
    expect(f.until).toBe(T0 + 160_000);
  });
});
