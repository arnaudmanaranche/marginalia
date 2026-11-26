import type { Meta, StoryObj } from '@storybook/react-vite';
import { RecapLine } from './RowRecap';
import { recapFixture } from './recapFixture';

const meta = { title: 'Scholia/Data display/RecapLine', component: RecapLine, args: { recap: recapFixture() } } satisfies Meta<typeof RecapLine>;
export default meta;
type Story = StoryObj<typeof meta>;

export const Returned: Story = {};
export const OnlyNew: Story = { args: { recap: recapFixture({ comments: [] }) } };
export const Nothing: Story = { args: { recap: recapFixture({ comments: [], newFindings: [] }) } };
