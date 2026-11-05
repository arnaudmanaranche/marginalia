import { describe, expect, it } from 'vitest';
import type { RunStage, RunStep } from './api';
import { planRows, position } from './plan';

const stage = (id: string, state: RunStage['state']): RunStage => ({ id, label: id, state, startedAt: null, endedAt: null });
const step = (stageId: string, text: string, tool?: string): RunStep => ({ at: 'x', text, stage: stageId, sub: false, ...(tool ? { tool } : {}) });

describe('a run as a plan', () => {
  it('gives each stage its steps, its tools once in order of use, and its latest action', () => {
    const rows = planRows([stage('checkout', 'done'), stage('agent', 'running')], [step('agent', 'Reading a.ts', 'read'), step('agent', '$ git diff', 'git'), step('agent', 'Reading b.ts', 'read')]);
    expect(rows[0].steps).toEqual([]);
    expect(rows[1].tools).toEqual(['read', 'git']);
    expect(rows[1].latest).toBe('Reading b.ts');
  });
  it('counts where the run stands', () => {
    expect(position([stage('a', 'done'), stage('b', 'running'), stage('c', 'pending')])).toEqual({ current: 2, total: 3 });
    expect(position([stage('a', 'done'), stage('b', 'done')])).toEqual({ current: 2, total: 2 });
    expect(position([stage('a', 'done'), stage('b', 'failed'), stage('c', 'skipped')])).toEqual({ current: 2, total: 3 });
  });
});
