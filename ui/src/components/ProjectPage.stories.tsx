import type { Meta, StoryObj } from '@storybook/react-vite';
import { ProjectPage } from './ProjectPage';
import type { StoredContext } from '../lib/contextApi';

const file = (ref: string) => ({ kind: 'file' as const, ref });
const approved: StoredContext = {
  project: 'webapp', commit: '196490cc6304f9ec', learnedAt: '2026-11-05T10:20:00Z', state: 'approved', approvedBy: 'amanaranche', approvedAt: '2026-11-05T10:40:00Z',
  context: {
    summary: 'The front-end of a travel platform: catalogue browsing, a trip builder, checkout and payment, and agency settings, for white-label channels.',
    criticalPaths: [
      { rank: 2, name: 'Checkout and payment', summary: 'Payment of a trip, then the redirect back.', where: ['src/app/features/checkout', 'src/app/store/features/checkout'], fragile: ['Bank transfer redirect'], sources: [{ kind: 'ticket', ref: 'ESD-1469' }, { kind: 'thread', ref: 'https://chat.example.com/archives/C1/p1' }] },
      { rank: 1, name: 'Agent sign-in and session refresh', summary: 'Log in and keep the session by refresh-token rotation.', fragile: ['Refresh rotation across tabs'], tests: ['tests/integration/specs/auth/login.spec.ts'], sources: [{ kind: 'ticket', ref: 'ESD-1446' }] },
    ],
    glossary: [
      { name: 'Channel', summary: 'A white-label customer site.', codeNames: ['channel', 'ChannelConfig'], sources: [file('docs/api-url-resolution.md')] },
      { name: 'Mark up', summary: 'The agency margin added to a trip price.', avoid: ['commission'], sources: [{ kind: 'ticket', ref: 'FEE-166' }] },
    ],
    features: [{ name: 'Trip timeline', summary: 'Edit the steps of a trip day by day.', where: ['src/app/(pages)/(timeline)'], sources: [file('src/app/routes.ts')] }],
    stack: [{ name: 'Data layer', summary: 'Redux Toolkit with one RTK Query API.', where: ['src/app/store/api.ts'], sources: [file('docs/adr/adr-002-single-rtk-query-api.md')] }],
  },
};
const draft: StoredContext = { ...approved, state: 'draft', approvedBy: null, approvedAt: null, commit: 'aa11bb22cc33', learnedAt: '2026-11-06T09:00:00Z' };

const meta = {
  title: 'Scholia/Pages/ProjectPage',
  component: ProjectPage,
  args: { state: { project: 'webapp', draft: null, approved, learning: false }, error: null, onRetry: () => {}, busy: null, onApprove: () => {}, onLearn: () => {} },
} satisfies Meta<typeof ProjectPage>;
export default meta;
type Story = StoryObj<typeof meta>;

export const Approved: Story = {};
export const DraftOverApproved: Story = { args: { state: { project: 'webapp', draft, approved, learning: false } } };
export const FirstDraft: Story = { args: { state: { project: 'webapp', draft, approved: null, learning: false } } };
export const Learning: Story = { args: { state: { project: 'webapp', draft: null, approved, learning: true } } };
export const NotLearned: Story = { args: { state: { project: 'api', draft: null, approved: null, learning: false } } };
export const Failed: Story = { args: { state: null, error: 'HTTP 503' } };
