import { useState } from 'react';
import type { Meta, StoryObj } from '@storybook/react-vite';
import { RerunConfirm } from './RerunConfirm';
import { Button } from './ui/Button';

const meta = {
  title: 'Scholia/Actions/RerunConfirm',
  component: RerunConfirm,
  args: { kind: 'review', estimateUsd: 0.42, leftUsd: 3.1, locked: false, reviewing: false, onRerun: () => {} },
  decorators: [(S) => <div className="flex min-h-24 items-center p-6"><S /></div>],
} satisfies Meta<typeof RerunConfirm>;
export default meta;
type Story = StoryObj<typeof meta>;

// Click once: the label morphs out of the icon with the cost and today's budget. Click again to run,
// or wait five seconds and it folds back.
export const Default: Story = {};
export const Triage: Story = { args: { kind: 'comments', estimateUsd: 0.18 } };
export const NoEstimate: Story = { args: { estimateUsd: null } };
export const NoDailyLimit: Story = { args: { leftUsd: null } };
export const Reviewing: Story = { args: { reviewing: true, locked: true } };
export const Locked: Story = { args: { locked: true } };

// The figures roll by place value when they change while the button is open: arm it, then spend.
export const LiveBudget: Story = {
  render: (args) => {
    const [left, setLeft] = useState(3.1);
    const [estimate, setEstimate] = useState(0.42);
    const [reviewing, setReviewing] = useState(false);
    return (
      <div className="flex flex-col items-start gap-4">
        <RerunConfirm {...args} estimateUsd={estimate} leftUsd={left} reviewing={reviewing} locked={reviewing}
          onRerun={() => { setReviewing(true); setTimeout(() => { setLeft((l) => Math.max(0, +(l - estimate).toFixed(2))); setReviewing(false); }, 1500); }} />
        <div className="flex gap-2">
          <Button size="sm" onMouseDown={(e) => e.preventDefault()} onClick={() => setLeft((l) => Math.max(0, +(l - 0.37).toFixed(2)))}>Another run spends $0.37</Button>
          <Button size="sm" onMouseDown={(e) => e.preventDefault()} onClick={() => setEstimate(+(0.2 + Math.random()).toFixed(2))}>New estimate</Button>
          <Button size="sm" onMouseDown={(e) => e.preventDefault()} onClick={() => { setLeft(3.1); setEstimate(0.42); }}>Reset</Button>
        </div>
      </div>
    );
  },
};
