import type { Meta, StoryObj } from '@storybook/react-vite';
import { JobsPage } from './JobsPage';
import type { Job } from '../lib/api';

const stage = (id: string, label: string, state: 'pending' | 'running' | 'done' | 'failed') => ({ id, label, state, startedAt: null, endedAt: null });
const base: Job = {
  id: '2026-11-05T10-00-00-000Z-review', slug: 'webapp/feat-coupons', project: 'webapp', iid: 4004, kind: 'review', command: '/code-review',
  startedAt: '2026-11-05T10:00:00.000Z', endedAt: '2026-11-05T10:00:36.000Z', outcome: 'reviewed', error: null, failure: null,
  stages: [stage('agent', 'Claude reviews the MR', 'done')], stepCount: 12, cost: { usd: 0.22, turns: 9, outputTokens: 2600 },
  what: 'review', title: 'feat(checkout): ask whether a traveler needs assistance at information step',
};
const jobs: Job[] = [
  { ...base, id: 'b', slug: 'webapp/own-feat-webmcp-core', iid: null, what: 'own', title: null, outcome: 'running', endedAt: null, cost: null, stages: [stage('checkout', 'Check out the MR branch', 'done'), stage('agent', 'Claude reviews the MR', 'running')] },
  { ...base, id: 'u', slug: 'webapp/_context', iid: null, kind: 'understand', what: 'understand', title: null, cost: { usd: 0.49, turns: 40, outputTokens: 9000 } },
  base,
  { ...base, id: 'f', slug: 'webapp/mr-comments-fix-auth-redirect-target-with-a-very-long-branch-name', what: 'comments', kind: 'triage', title: null, outcome: 'failed', error: 'GitLab API /projects/67 -> 502', failure: { kind: 'gitlab', transient: true, title: 'GitLab did not answer', advice: 'It is retried soon.' } },
];

const meta = {
  title: 'Scholia/Pages/JobsPage',
  component: JobsPage,
  args: { jobs, error: null, onRetry: () => {}, showProject: false, onOpen: () => {} },
} satisfies Meta<typeof JobsPage>;
export default meta;
type Story = StoryObj<typeof meta>;

export const List: Story = {};
export const SeveralProjects: Story = { args: { showProject: true } };
export const Loading: Story = { args: { jobs: null } };
export const Empty: Story = { args: { jobs: [] } };
export const Failed: Story = { args: { jobs: null, error: 'HTTP 503' } };
