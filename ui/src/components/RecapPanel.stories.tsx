import type { Meta, StoryObj } from '@storybook/react-vite';
import { RecapPanel } from './RecapPanel';
import { recapFinding, recapFixture } from './recapFixture';

const meta = { title: 'Scholia/Data display/RecapPanel', component: RecapPanel, args: { recap: recapFixture() } } satisfies Meta<typeof RecapPanel>;
export default meta;
type Story = StoryObj<typeof meta>;

export const ReReviewed: Story = {};
export const NothingHappened: Story = { args: { recap: recapFixture({ comments: [], newFindings: [], mr: { commits: 0, files: 0, commentedFilesTouched: 0 } }) } };
export const VersionGone: Story = { args: { recap: recapFixture({ mr: null, newFindings: [recapFinding({ onChangedCode: null })] }) } };
export const NothingSubmitted: Story = { args: { recap: recapFixture({ baseline: { kind: 'previous', at: new Date(Date.now() - 26 * 3_600_000).toISOString() }, comments: [] }) } };
export const NoLongerRaised: Story = { args: { recap: recapFixture({ comments: [], newFindings: [], gone: [recapFinding({ id: 'g', title: 'An old worry the bot dropped', onChangedCode: true })] }) } };
