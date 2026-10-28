import { describe, expect, it } from 'vitest';
import type { RunStage, RunSummary } from './api';
import { duration, runHeadline, runToFlag, stageTime } from './runs';

const stage = (id: string, state: RunStage['state'], over: Partial<RunStage> = {}): RunStage => ({ id, label: `Do ${id}`, state, startedAt: null, endedAt: null, ...over });
const run = (over: Partial<RunSummary> = {}): RunSummary => ({
  id: 'r1', slug: 'webapp/feat-x', project: 'webapp', iid: 12, kind: 'review', command: '/code-review',
  startedAt: '2026-10-28T10:00:00Z', endedAt: null, outcome: 'running', error: null,
  stages: [stage('checkout', 'done'), stage('agent', 'running'), stage('report', 'pending')],
  stepCount: 3, cost: null, failure: null, ...over,
});
const now = Date.parse('2026-10-28T10:02:05Z');

describe('duration', () => {
  it('reads like a person says it', () => {
    expect(duration(42_000)).toBe('42s');
    expect(duration(185_000)).toBe('3m 05s');
    expect(duration(3_720_000)).toBe('1h 02m');
  });
});

describe('stageTime', () => {
  it('counts a running stage up to now, and is empty for one that never started', () => {
    expect(stageTime(stage('a', 'running', { startedAt: '2026-10-28T10:02:00Z' }), now)).toBe('5s');
    expect(stageTime(stage('a', 'done', { startedAt: '2026-10-28T10:00:00Z', endedAt: '2026-10-28T10:00:30Z' }), now)).toBe('30s');
    expect(stageTime(stage('a', 'pending'), now)).toBeNull();
  });
});

describe('runHeadline', () => {
  it('says which step a running run is on', () => {
    expect(runHeadline(run(), { awaiting: null, now })).toEqual({ tone: 'info', title: 'Reviewing now', detail: 'Step 2 of 3: Do agent · 2m 05s' });
    expect(runHeadline(run({ kind: 'triage' }), { awaiting: null, now })?.title).toBe('Answering the reviewers now');
  });
  it('names the stage a failed run stopped at', () => {
    const failed = run({ outcome: 'failed', endedAt: '2026-10-28T10:01:00Z', stages: [stage('checkout', 'done'), stage('agent', 'failed'), stage('report', 'skipped')] });
    expect(runHeadline(failed, { awaiting: null, now })).toEqual({ tone: 'danger', title: 'The last run failed', detail: 'During "Do agent", after 1m 00s.' });
  });
  it('says what failed in plain words, and does not alarm on what passes by itself', () => {
    const network = { kind: 'network', transient: true, title: 'GitLab could not be reached', advice: '' };
    const login = { kind: 'claude_login', transient: false, title: 'Claude is not logged in', advice: '' };
    expect(runHeadline(run({ outcome: 'failed', failure: network }), { awaiting: null, now })).toMatchObject({ tone: 'warning', title: 'GitLab could not be reached: retrying soon' });
    expect(runHeadline(run({ outcome: 'failed', failure: login }), { awaiting: null, now })).toMatchObject({ tone: 'danger', title: 'Claude is not logged in' });
    expect(runHeadline(null, { awaiting: 'failed', now, failure: network })).toMatchObject({ tone: 'warning', detail: 'Retrying soon, on its own.' });
  });
  it('tells a queued MR apart from one with nothing to say', () => {
    expect(runHeadline(null, { awaiting: 'queued', now })?.title).toBe('Waiting for its first review');
    expect(runHeadline(null, { awaiting: 'failed', now })?.tone).toBe('danger');
    expect(runHeadline(null, { awaiting: null, now })).toBeNull();
  });
});

describe('runToFlag', () => {
  it('flags the newest run when it failed after the report on screen', () => {
    const failed = run({ outcome: 'failed', startedAt: '2026-10-28T11:00:00Z' });
    expect(runToFlag([failed], '2026-10-28T09:00:00Z')).toBe(failed);
    expect(runToFlag([failed], '2026-10-28T12:00:00Z')).toBeNull();
    expect(runToFlag([run({ outcome: 'reviewed' }), failed], '2026-10-28T09:00:00Z')).toBeNull();
    expect(runToFlag(null, undefined)).toBeNull();
  });
});
