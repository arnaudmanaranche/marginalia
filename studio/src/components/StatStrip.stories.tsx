import { useState } from 'react';
import type { Meta, StoryObj } from '@storybook/react-vite';
import { StatStrip, type Filter } from './StatStrip';

const meta = {
  title: 'Scholia/Navigation/StatStrip',
  component: StatStrip,
  args: { counts: { changes: 3, unread: 5 }, active: 'all', keys: ['changes', 'unread'], onChange: () => {} },
} satisfies Meta<typeof StatStrip>;
export default meta;
type Story = StoryObj<typeof meta>;

// Counters double as filters: click one to filter, click again to clear.
export const Interactive: Story = {
  render: (args) => {
    const [active, setActive] = useState<Filter>('all');
    return <StatStrip {...args} active={active} onChange={setActive} />;
  },
};
export const Selected: Story = { args: { active: 'changes' } };
export const EmptyCounter: Story = { args: { counts: { changes: 0, unread: 2 } } };
export const SingleTile: Story = { args: { keys: ['unread'] } };
