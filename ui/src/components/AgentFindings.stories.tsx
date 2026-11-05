import type { Meta, StoryObj } from '@storybook/react-vite';
import { AgentFindings } from './AgentFindings';
import type { Agent, Swarm } from '../lib/agents';
import type { FoundFinding, ToolCallRecord } from '../lib/api';

const now = Date.now();
const ago = (s: number) => new Date(now - s * 1000).toISOString();
const agent = (id: string, label: string, state: Agent['state'], over: Partial<Agent> = {}): Agent => ({
  id, label: `Review: ${label}`, state, startedAt: state === 'pending' ? null : ago(120), endedAt: state === 'done' || state === 'failed' ? ago(20) : null,
  usage: null, calls: Array.from({ length: state === 'pending' ? 0 : 9 }, (_, i) => ({ id: `${id}-${i}` }) as ToolCallRecord), current: null, step: null, failedCalls: 0, tools: [], ...over,
});
const found = (id: string, stage: string, severity: FoundFinding['severity'], title: string, path: string | null, line: number | null, s: number): FoundFinding => ({ id, stage, severity, title, path, line, at: ago(s) });

const swarm: Swarm = {
  agents: [
    agent('chapter-1', 'A coupon takes its percentage off the total', 'done'),
    agent('chapter-2', 'The checkout trusts the price the client sends', 'running', { current: { id: 'c', tool: 'grep', what: 'Searching for "unitPrice"', sub: false, stage: 'chapter-2', startedAt: ago(4), endedAt: null, ms: null, ok: null, error: null } }),
    agent('chapter-3', 'Tests for the coupon rules', 'running', { step: 'The rounding case is covered; I check the negative one.' }),
    agent('chapter-4', 'Generated API types', 'pending'),
  ],
  found: [
    found('neg-total', 'chapter-1', 'important', 'The total can go below zero', 'src/pricing.ts', 42, 30),
    found('client-price', 'chapter-1', 'critical', 'A client can set its own price', 'api/checkout.ts', 88, 35),
    found('naming', 'chapter-1', 'suggestion', 'The helper name says less than it does', 'src/pricing.ts', 12, 36),
    found('doc', 'chapter-1', 'info', 'The ADR on prices could mention coupons', null, null, 37),
    found('tz', 'chapter-1', 'suggestion', 'Expiry is compared in local time', 'src/coupon.ts', 20, 38),
  ],
};

const meta = {
  title: 'Scholia/Data display/AgentFindings',
  component: AgentFindings,
  args: { swarm },
  decorators: [(Story) => <div className="max-w-xl"><Story /></div>],
} satisfies Meta<typeof AgentFindings>;
export default meta;
type Story = StoryObj<typeof meta>;

export const Live: Story = {};
export const NothingYet: Story = { args: { swarm: { ...swarm, found: [] } } };
