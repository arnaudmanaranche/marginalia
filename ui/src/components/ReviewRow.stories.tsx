import type { Meta, StoryObj } from '@storybook/react-vite';
import { ReviewRow } from './ReviewRow';
import { approved, other, review } from '../stories/fixtures';

const meta = {
  title: 'Scholia/Data display/ReviewRow',
  component: ReviewRow,
  args: { item: review, unread: false },
  decorators: [(Story) => <ul className="divide-y divide-line overflow-hidden rounded-xl border border-line"><Story /></ul>],
} satisfies Meta<typeof ReviewRow>;
export default meta;
type Story = StoryObj<typeof meta>;

export const Read: Story = {};
export const Unread: Story = { args: { unread: true } };
export const Queued: Story = { args: { item: { ...review, awaiting: 'queued' } } };
export const HeldByBudget: Story = { args: { item: { ...review, awaiting: 'queued' }, held: true } };
export const List: Story = {
  render: () => (
    <>
      <ReviewRow item={review} unread />
      <ReviewRow item={approved} unread={false} />
      <ReviewRow item={other} unread={false} />
    </>
  ),
};
