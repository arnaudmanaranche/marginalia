import type { Meta, StoryObj } from '@storybook/react-vite';
import { ReviewLineCard } from './ReviewLineCard';

const meta = {
  title: 'Scholia/Data display/ReviewLineCard',
  component: ReviewLineCard,
  args: { metrics: { days: 28, jobs: { total: 64, failed: 3, running: 0, medianMs: 95_000, costUsd: 21.4 }, findings: { asProposed: 41, edited: 12, unknown: 0, dismissed: 9, pending: 7, fixedBefore: 14, actedOnRate: 62 / 69 } } },
} satisfies Meta<typeof ReviewLineCard>;
export default meta;
type Story = StoryObj<typeof meta>;

export const Busy: Story = {};
export const Quiet: Story = { args: { metrics: { days: 28, jobs: { total: 0, failed: 0, running: 0, medianMs: null, costUsd: 0 }, findings: { asProposed: 0, edited: 0, unknown: 0, dismissed: 0, pending: 0, fixedBefore: 0, actedOnRate: null } } } };
export const WithFailures: Story = { args: { metrics: { days: 28, jobs: { total: 12, failed: 4, running: 1, medianMs: 41_000, costUsd: 3.2 }, findings: { asProposed: 2, edited: 1, unknown: 30, dismissed: 0, pending: 11, fixedBefore: 0, actedOnRate: 0.7 } } } };
