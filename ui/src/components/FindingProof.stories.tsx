import type { Meta, StoryObj } from '@storybook/react-vite';
import { FindingProof } from './FindingProof';

const meta = { title: 'Scholia/Feedback/FindingProof', component: FindingProof } satisfies Meta<typeof FindingProof>;
export default meta;
type Story = StoryObj<typeof meta>;

export const Reproduced: Story = { args: { verification: { status: 'reproduced', evidence: 'Ran the total with a 150% coupon: it printed -50 instead of 0.', command: 'run the tests repro/total.test.ts' } } };
export const NotReproduced: Story = { args: { verification: { status: 'not_reproduced', evidence: 'The total stayed at 0 for 150% and 200%.', command: 'run the tests repro/total.test.ts' } } };
export const Inconclusive: Story = { args: { verification: { status: 'inconclusive', evidence: 'Could not run: the setup step failed, there is no network.' } } };
export const NotRun: Story = { args: { verification: { status: 'skipped', evidence: 'The approved project context has no recipe for running the project.' } } };
const SHOT = `data:image/svg+xml;utf8,${encodeURIComponent('<svg xmlns="http://www.w3.org/2000/svg" width="320" height="160"><rect width="320" height="160" fill="#f4f4f5"/><rect x="16" y="16" width="90" height="28" rx="4" fill="#d4d4d8"/><text x="16" y="84" font-family="sans-serif" font-size="16">0 items in your cart</text></svg>')}`;
export const WithBrowserEvidence: Story = {
  args: {
    verification: {
      status: 'reproduced',
      evidence: 'Clicked "Add item": the counter showed -1 instead of 1, and the console logged the error.',
      artifacts: [
        { kind: 'screenshot', name: 'screenshot.png', ref: SHOT },
        { kind: 'log', name: 'console.txt', ref: '/api/evidence/run-1-verify-1/console.txt' },
        { kind: 'log', name: 'requests.txt', ref: '/api/evidence/run-1-verify-1/requests.txt' },
      ],
    },
  },
};
