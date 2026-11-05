import type { Meta, StoryObj } from '@storybook/react-vite';
import { AgentMonitor } from './AgentMonitor';
import type { Agent } from '../lib/agents';
import type { ToolCallRecord } from '../lib/api';

const now = Date.now();
const ago = (s: number) => new Date(now - s * 1000).toISOString();
const call = (id: string, tool: string, what: string, start: number, ms: number | null, over: Partial<ToolCallRecord> = {}): ToolCallRecord => ({
  id, tool, what, sub: false, stage: 'chapter-1', startedAt: ago(start), endedAt: ms === null ? null : ago(start - ms / 1000), ms, ok: ms === null ? null : true, error: null, ...over,
});
const calls = [
  call('a', 'git', '$ git diff origin/main...HEAD -- src/checkout', 95, 1800),
  call('b', 'read', 'Reading CheckoutStep.tsx', 90, 400),
  call('c', 'grep', 'Searching for "needsAssistance"', 82, 900),
  call('d', 'read', 'Reading assistance.test.ts', 70, 300),
  call('e', 'git', '$ git log -5 -- src/checkout/assistance.ts', 60, 2100, { ok: false, error: "fatal: ambiguous argument 'src/checkout/assistance.ts': unknown revision" }),
  call('f', 'jira.getJiraIssue', 'getJiraIssue', 45, 3200, { sub: true }),
  call('g', 'read', 'Reading api/traveler.ts', 12, null),
];
const running: Agent = {
  id: 'chapter-1', label: 'Review: the assistance question at the information step', state: 'running', startedAt: ago(100), endedAt: null,
  usage: { model: 'claude-opus-5-5', calls: 1, turns: 14, usd: 0.184, ms: 88_000, inputTokens: 420, outputTokens: 6200, cacheReadTokens: 184_000, cacheWriteTokens: 12_000 },
  calls, current: calls[6], step: null, failedCalls: 1, tools: ['git', 'read', 'grep', 'jira.getJiraIssue'],
};
const done: Agent = { ...running, state: 'done', endedAt: ago(5), current: null, calls: calls.map((c) => (c.ms === null ? { ...c, ms: 7000, endedAt: ago(5), ok: true } : c)) };

const meta = {
  title: 'Scholia/Data display/AgentMonitor',
  component: AgentMonitor,
  args: { agent: running },
  decorators: [(Story) => <div className="max-w-md"><Story /></div>],
} satisfies Meta<typeof AgentMonitor>;
export default meta;
type Story = StoryObj<typeof meta>;

export const Running: Story = {};
export const Thinking: Story = { args: { agent: { ...running, current: null, step: 'The flag is read in two places; I check the second one.' } } };
export const Finished: Story = { args: { agent: done } };
export const Failed: Story = { args: { agent: { ...done, state: 'failed' } } };
export const Folded: Story = { args: { agent: done, defaultFolded: true } };
