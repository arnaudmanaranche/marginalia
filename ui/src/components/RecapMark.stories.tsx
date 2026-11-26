import type { Meta, StoryObj } from '@storybook/react-vite';
import { marksOf } from '../lib/recapMarks';
import { RecapMarksContext } from '../lib/reviewContexts';
import { RecapMark } from './RecapMark';
import { recapFinding, recapFixture } from './recapFixture';

const recap = recapFixture({ newFindings: [recapFinding({ id: 'n' })], reworded: [{ was: recapFinding({ id: 'w', title: 'Total can be negative' }), now: recapFinding({ id: 'r' }) }] });
const meta = {
  title: 'Scholia/Data display/RecapMark', component: RecapMark,
  decorators: [(Story) => <RecapMarksContext.Provider value={marksOf(recap)}><div className="flex gap-2 p-4"><Story /></div></RecapMarksContext.Provider>],
} satisfies Meta<typeof RecapMark>;
export default meta;
type Story = StoryObj<typeof meta>;

export const New: Story = { args: { id: 'n' } };
export const Reworded: Story = { args: { id: 'r' } };
export const Addressed: Story = { args: { id: 'a' } };
export const Contested: Story = { args: { id: 'b' } };
export const Untouched: Story = { args: { id: 'c' } };
