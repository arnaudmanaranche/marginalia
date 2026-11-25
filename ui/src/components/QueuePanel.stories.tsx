import type { Meta, StoryObj } from '@storybook/react-vite';
import { QueuePanel } from './QueuePanel';
import type { QueueTask, QueueView } from '../lib/queue';

const now = Date.now();
const ago = (min: number) => new Date(now - min * 60_000).toISOString();
const task = (over: Partial<QueueTask>): QueueTask => ({
  id: 'x', kind: 'poll', project: null, label: 'Poll the open MRs', priority: 'normal', status: 'done',
  enqueuedAt: ago(60), startedAt: ago(59), endedAt: ago(50), attempt: 1, maxAttempts: 2, error: null, position: null, detail: null, jobs: [], ...over,
});
// The polls that found nothing, as the live line is mostly made of: every ~2.5 min per project.
// A project runs one task at a time, so none falls while another task of its project ran (`busy`).
const quiet = (project: string, offset: number, busy: [number, number][] = []) => Array.from({ length: 28 }, (_, i) => offset + i * 2.5)
  .filter((min) => !busy.some(([from, to]) => min <= from && min >= to))
  .map((min) => task({ id: `q-${project}-${min}`, project, label: `Poll ${project}`, enqueuedAt: ago(min), startedAt: ago(min - 0.01), endedAt: ago(min - 0.04) }));
const job = (id: string, title: string, min: number, cost: number) => ({ slug: `webapp/${id}`, id, outcome: 'reviewed' as const, title, startedAt: ago(min), endedAt: ago(min - 4), costUsd: cost });

const busy: QueueView = {
  now: new Date(now).toISOString(),
  workers: [{ id: 'w1', name: 'Worker 1', detail: 'webapp !4004 feat(checkout): ask whether a traveler needs assistance', taskId: 'r' }, { id: 'w2', name: 'Worker 2', detail: 'api !88 Learn the project', taskId: 'r2' }],
  totals: { done: 41, failed: 2 },
  budget: {
    since: new Date(new Date(now).setHours(0, 0, 0, 0)).toISOString(), resetsAt: new Date(new Date(now).setHours(24, 0, 0, 0)).toISOString(), limitUsd: 25, spentUsd: 12.4, leftUsd: 12.6, over: false, runs: 9,
    byKind: [{ kind: 'review', usd: 10.2, runs: 6 }, { kind: 'triage', usd: 1.4, runs: 2 }, { kind: 'mention', usd: 0.8, runs: 1 }],
    byMr: [{ project: 'webapp', iid: 4004, usd: 4.1, runs: 3 }, { project: 'webapp', iid: 3990, usd: 2.9, runs: 1 }, { project: 'api', iid: 88, usd: 1.7, runs: 2 }],
  },
  tasks: [
    task({ id: 'r', project: 'webapp', label: 'Poll webapp', status: 'running', enqueuedAt: ago(12), startedAt: ago(11), endedAt: null, detail: 'webapp !4004 feat(checkout): ask whether a traveler needs assistance', jobs: [{ ...job('feat-coupons', 'Add coupons', 10, 0.31), outcome: 'reviewed' }, { slug: 'webapp/feat-checkout', id: 'c', outcome: 'running', title: 'feat(checkout): assistance', startedAt: ago(4), endedAt: null, costUsd: null }] }),
    task({ id: 'r2', kind: 'understand', project: 'api', label: 'Learn the project', priority: 'high', status: 'running', enqueuedAt: ago(6), startedAt: ago(5), endedAt: null, detail: null }),
    task({ id: 'm', kind: 'mention', project: 'webapp', label: 'Answer a mention on !4012', priority: 'high', status: 'queued', enqueuedAt: ago(3), startedAt: null, endedAt: null, position: 1 }),
    task({ id: 'u', kind: 'understand', project: 'webapp', label: 'Learn the project', priority: 'high', status: 'queued', enqueuedAt: ago(2), startedAt: null, endedAt: null, position: 2, attempt: 2 }),
    task({ id: 'p', project: 'api', label: 'Poll api', status: 'queued', enqueuedAt: ago(1), startedAt: null, endedAt: null, position: 3 }),
    task({ id: 'd1', project: 'webapp', label: 'Poll webapp', enqueuedAt: ago(40), startedAt: ago(38), endedAt: ago(25), jobs: [job('fix-auth', 'Fix auth redirect', 37, 0.42), job('own-webmcp', 'own: webmcp core', 30, 0.18)] }),
    task({ id: 'f1', kind: 'mention', project: 'webapp', label: 'Answer a mention on !3990', priority: 'high', status: 'failed', enqueuedAt: ago(21.5), startedAt: ago(21), endedAt: ago(20), error: 'GitLab API /projects/67/merge_requests/3990 -> 502' }),
    task({ id: 'd2', project: 'api', label: 'Poll api', enqueuedAt: ago(54), startedAt: ago(53.8), endedAt: ago(47), jobs: [job('fix-rate', 'fix(rate): round half even', 53, 0.21)] }),
    ...quiet('webapp', 1.5, [[12, 0], [40, 25], [22, 19.5]]), ...quiet('api', 6.4),
  ],
};

const meta = {
  title: 'Scholia/Data display/QueuePanel',
  component: QueuePanel,
  args: { queue: busy, onOpen: () => {} },
} satisfies Meta<typeof QueuePanel>;
export default meta;
type Story = StoryObj<typeof meta>;

export const Busy: Story = {};
export const Idle: Story = { args: { nextPollAt: new Date(now + 4 * 60_000).toISOString(), queue: { ...busy, workers: [{ id: 'w1', name: 'Worker 1', detail: null, taskId: null }, { id: 'w2', name: 'Worker 2', detail: null, taskId: null }], tasks: busy.tasks.filter((t) => t.status === 'done' || t.status === 'failed') } } };
export const Empty: Story = { args: { queue: { now: busy.now, workers: [{ id: 'w1', name: 'Worker 1', detail: null, taskId: null }, { id: 'w2', name: 'Worker 2', detail: null, taskId: null }], tasks: [], totals: { done: 0, failed: 0 }, budget: { ...busy.budget!, spentUsd: 0, leftUsd: 25, runs: 0, byKind: [], byMr: [] } } } };
export const NearTheLimit: Story = { args: { queue: { ...busy, budget: { ...busy.budget!, spentUsd: 21.3, leftUsd: 3.7 } } } };
export const BudgetReached: Story = { args: { queue: { ...busy, budget: { ...busy.budget!, spentUsd: 26.12, leftUsd: 0, over: true, runs: 14 } } } };
export const NoDailyLimit: Story = { args: { queue: { ...busy, budget: { ...busy.budget!, limitUsd: null, leftUsd: null } } } };
