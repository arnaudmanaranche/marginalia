import type { Meta, StoryObj } from '@storybook/react-vite';
import { Badge } from './Badge';

const meta = {
  title: 'Scholia/Feedback/Badge',
  component: Badge,
  args: { children: 'In pending review', tone: 'neutral' },
  argTypes: { tone: { control: 'select', options: ['neutral', 'info', 'success', 'warning', 'danger', 'violet'] } },
} satisfies Meta<typeof Badge>;
export default meta;
type Story = StoryObj<typeof meta>;

export const Neutral: Story = {};
// One shape for every badge: text on the tone's fill, with its border. No icons.
export const Tones: Story = {
  render: () => (
    <div className="flex flex-wrap items-center gap-2">
      {(['neutral', 'info', 'success', 'warning', 'danger', 'violet'] as const).map((tone) => (
        <Badge key={tone} tone={tone}>{tone}</Badge>
      ))}
    </div>
  ),
};
