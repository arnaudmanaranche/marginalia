import type { Meta, StoryObj } from '@storybook/react-vite';
import { RunPlan } from './RunPlan';
import type { RunStage, RunStep } from '../lib/api';

const NOW = Date.parse('2026-11-05T10:03:00Z');
const t = (s: number) => new Date(Date.parse('2026-11-05T10:00:00Z') + s * 1000).toISOString();
const stage = (id: string, label: string, state: RunStage['state'], start: number | null, end: number | null): RunStage => ({ id, label, state, startedAt: start === null ? null : t(start), endedAt: end === null ? null : t(end) });
const step = (stageId: string, at: number, text: string, tool?: string): RunStep => ({ at: t(at), text, stage: stageId, sub: false, ...(tool ? { tool } : {}) });

const steps: RunStep[] = [
  step('preflight', 1, '✓ Claude: logged in (claude.ai)'), step('preflight', 2, '✓ Jira connector: claude.ai Atlassian MCP is connected', 'jira.atlassianUserInfo'),
  step('checkout', 4, '$ git fetch origin', 'git'),
  step('context', 8, 'Reading the conversation', 'gitlab.get_merge_request'),
  step('agent', 20, 'Reading check-webmcp-token-expiry.mjs', 'read'), step('agent', 41, '$ git diff origin/develop...HEAD', 'git'),
  step('agent', 66, 'Searching for "readTokenPayload"', 'grep'), step('agent', 92, 'Looking up the ticket COL-1146', 'jira.getJiraIssue'),
];
const running: RunStage[] = [
  stage('preflight', 'Check what the run needs', 'done', 0, 3), stage('checkout', 'Check out the MR branch', 'done', 3, 6),
  stage('context', 'Read the conversation and the last report', 'done', 6, 12), stage('agent', 'Claude reviews the MR', 'running', 12, null),
  stage('report', 'Save the report', 'pending', null, null),
];

const meta = { title: 'Scholia/Data display/RunPlan', component: RunPlan, args: { stages: running, steps, now: NOW }, decorators: [(S) => <div className="max-w-xl rounded-xl border border-line bg-surface p-4"><S /></div>] } satisfies Meta<typeof RunPlan>;
export default meta;
type Story = StoryObj<typeof meta>;

export const Running: Story = {};
export const Done: Story = { args: { stages: running.map((s, i) => ({ ...s, state: 'done', startedAt: s.startedAt ?? t(150), endedAt: s.endedAt ?? t(150 + i)})) } };
export const Failed: Story = { args: { stages: running.map((s) => (s.id === 'agent' ? { ...s, state: 'failed', endedAt: t(120) } : s.state === 'pending' ? { ...s, state: 'skipped' } : s)) } };
export const Starting: Story = { args: { stages: running.map((s, i) => ({ ...s, state: i === 0 ? 'running' : 'pending', startedAt: i === 0 ? t(0) : null, endedAt: null })), steps: [] } };
