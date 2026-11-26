import type { Meta, StoryObj } from '@storybook/react-vite';
import { RecapPanel } from './RecapPanel';
import { recapFinding, recapFixture } from './recapFixture';

const meta = { title: 'Scholia/Data display/RecapPanel', component: RecapPanel, args: { recap: recapFixture() } } satisfies Meta<typeof RecapPanel>;
export default meta;
type Story = StoryObj<typeof meta>;

export const ReReviewed: Story = {};
export const NothingHappened: Story = { args: { recap: recapFixture({ comments: [], newFindings: [], mr: { commits: 0, files: 0, commentedFilesTouched: 0 }, counts: { addressed: 0, contested: 0, untouched: 0, dropped: 0, newFindings: 0, reworded: 0, gone: 0 } }) } };
export const VersionGone: Story = { args: { recap: recapFixture({ mr: null, newFindings: [recapFinding({ onChangedCode: null })], counts: { addressed: 1, contested: 1, untouched: 1, dropped: 0, newFindings: 1, reworded: 0, gone: 0 } }) } };
export const NothingSubmitted: Story = { args: { recap: recapFixture({ baseline: { kind: 'previous', at: new Date(Date.now() - 26 * 3_600_000).toISOString() }, comments: [], counts: { addressed: 0, contested: 0, untouched: 0, dropped: 0, newFindings: 2, reworded: 0, gone: 0 } }) } };
