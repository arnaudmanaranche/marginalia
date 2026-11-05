import type { Meta, StoryObj } from '@storybook/react-vite';
import { Inbox } from 'lucide-react';
import { FeedRow } from './FeedRow';
import { StatusMark } from './ds/StatusMark';

const meta = { title: 'Scholia/Data display/FeedRow', component: FeedRow, args: { mark: <Inbox className="size-4 text-run" />, title: '42 proposed comments to decide', detail: 'Add each to your review, edited or not, or dismiss it', onOpen: () => {} }, decorators: [(S) => <ul className="divide-y divide-line overflow-hidden rounded-xl border border-line"><S /></ul>] } satisfies Meta<typeof FeedRow>;
export default meta;
type Story = StoryObj<typeof meta>;

export const Approvals: Story = {};
export const Failure: Story = { args: { mark: <StatusMark state="failed" />, title: 'agent-bugfix-fee-193-cross-tab-refresh', detail: 'A check before the run failed · Review' } };
