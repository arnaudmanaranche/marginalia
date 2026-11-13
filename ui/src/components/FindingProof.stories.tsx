import type { Meta, StoryObj } from '@storybook/react-vite';
import { FindingProof } from './FindingProof';

const meta = { title: 'Scholia/Feedback/FindingProof', component: FindingProof } satisfies Meta<typeof FindingProof>;
export default meta;
type Story = StoryObj<typeof meta>;

export const Reproduced: Story = { args: { verification: { status: 'reproduced', evidence: 'Ran the total with a 150% coupon: it printed -50 instead of 0.', command: 'run the tests repro/total.test.ts' } } };
export const NotReproduced: Story = { args: { verification: { status: 'not_reproduced', evidence: 'The total stayed at 0 for 150% and 200%.', command: 'run the tests repro/total.test.ts' } } };
export const Inconclusive: Story = { args: { verification: { status: 'inconclusive', evidence: 'Could not run: the setup step failed, there is no network.' } } };
export const NotRun: Story = { args: { verification: { status: 'skipped', evidence: 'The approved project context has no recipe for running the project.' } } };
export const WithBrowserEvidence: Story = {
  args: {
    verification: {
      status: 'reproduced',
      evidence: 'Clicked "Add item": the counter showed -1 instead of 1, and the console logged the error.',
      artifacts: [
        { kind: 'screenshot', name: 'screenshot.png', ref: '/api/evidence/run-1-verify-1/screenshot.png' },
        { kind: 'log', name: 'console.txt', ref: '/api/evidence/run-1-verify-1/console.txt' },
        { kind: 'log', name: 'requests.txt', ref: '/api/evidence/run-1-verify-1/requests.txt' },
      ],
    },
  },
};
