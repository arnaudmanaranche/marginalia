import type { Meta, StoryObj } from '@storybook/react-vite';
import { ApprovalsPage } from './ApprovalsPage';
import type { Proposal } from '../lib/approvalsApi';

const p = (over: Partial<Proposal>): Proposal => ({
  slug: 'webapp/feat-pam-748', project: 'webapp', iid: 4004, mrTitle: 'feat(checkout): ask whether a traveler needs assistance at information step', webUrl: 'https://git.example.com/mr/4004',
  reviewedAt: '2026-11-05T10:36:00Z', findingId: 'f1', severity: 'important', title: 'The default ignores the API default', body: 'The form starts at No even when the schema sends a default, so a channel that wants Yes by default never gets it.', path: 'src/app/features/checkout/information/InformationForm.tsx', line: 88,
  comment: 'When the schema sends a default for `assistanceRequested`, this still starts at No. Could it read the default first?', criticalPaths: ['Checkout and payment'], ...over,
});
const proposals = [
  p({}),
  p({ findingId: 'f2', severity: 'suggestion', title: 'Name the payload helper after what it builds', path: 'src/app/features/checkout/helpers/payload.ts', line: 12, comment: 'Small one: `buildPayload` could say it builds the information step payload.' }),
  p({ slug: 'webapp/feat-col-1157', iid: 4040, mrTitle: 'feat(COL-1157): zoom where the agent points and edit a step in one click', findingId: 'g1', severity: 'critical', title: 'A deleted step crashes the map', path: null, line: null, criticalPaths: [], comment: 'Opening a trip whose step was deleted throws in the map: the step id is read without a guard.' }),
];

const meta = {
  title: 'Scholia/Pages/ApprovalsPage',
  component: ApprovalsPage,
  args: { proposals, canPost: true, error: null, onRetry: () => {}, busyId: null, onDismiss: () => {}, onOpen: () => {}, reload: () => {} },
} satisfies Meta<typeof ApprovalsPage>;
export default meta;
type Story = StoryObj<typeof meta>;

export const Waiting: Story = {};
export const PostingOff: Story = { args: { canPost: false } };
export const Empty: Story = { args: { proposals: [] } };
export const Loading: Story = { args: { proposals: null } };
export const Failed: Story = { args: { proposals: null, error: 'HTTP 503' } };
