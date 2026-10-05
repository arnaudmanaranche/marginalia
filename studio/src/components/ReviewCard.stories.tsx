import type { Meta, StoryObj } from '@storybook/react-vite';
import { ReviewCard } from './ReviewCard';
import { approved, review } from '../stories/fixtures';

const meta = {
  title: 'Scholia/Data display/ReviewCard',
  component: ReviewCard,
  args: { item: review, unread: true, size: 'medium', resizing: false },
  argTypes: { size: { control: 'inline-radio', options: ['small', 'medium', 'large'] } },
  decorators: [(Story) => <div className="max-w-sm"><Story /></div>],
} satisfies Meta<typeof ReviewCard>;
export default meta;
type Story = StoryObj<typeof meta>;

export const Medium: Story = {};
export const Small: Story = { args: { size: 'small' } };
// Large reveals the branch, summary and the highlighted findings.
export const Large: Story = { args: { size: 'large' } };
export const Read: Story = { args: { unread: false } };
export const Approved: Story = { args: { item: approved, unread: false, size: 'large' } };
export const Triage: Story = { args: { item: { ...review, kind: 'comments' } } };
