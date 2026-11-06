import type { Meta, StoryObj } from '@storybook/react-vite';
import { ReviewRisk } from './ReviewRisk';

const meta = {
  title: 'Scholia/Feedback/ReviewRisk',
  component: ReviewRisk,
} satisfies Meta<typeof ReviewRisk>;
export default meta;
type Story = StoryObj<typeof meta>;

export const High: Story = {
  args: {
    risk: {
      level: 'high', rationale: 'Drops a column.', factors: [],
      axes: [
        { axis: 'verification', level: 'medium', note: 'Tests cover the happy path only.' },
        { axis: 'alignment', level: 'low', note: 'Matches the ticket.' },
        { axis: 'impact', level: 'medium', note: 'Touches the order totals.' },
        { axis: 'rollback', level: 'high', note: 'The migration deletes a column: a one-way door.' },
        { axis: 'detection', level: 'low', note: 'Failures are logged and alerted.' },
      ],
      mitigations: ['Split the migration into its own MR.', 'Add a test for a negative total.'],
    },
  },
};
// Quiet when there is nothing to weigh, and on reviews made before the axes existed.
export const Low: Story = { args: { risk: { level: 'low', rationale: 'Small.', factors: [], axes: [] } } };
