import type { Meta, StoryObj } from '@storybook/react-vite';
import type { FixesStatus, Reply, Thread } from '../lib/api';
import { RepliesPanel } from './RepliesPanel';

const thread = (id: string, path: string, line: number, body: string): Thread => ({
  id, resolved: false, resolvable: true, path, line, side: 'new', outdated: false,
  notes: [{ id: 1, author: 'bob', authorName: 'Bob', mine: false, bot: false, body, at: '2026-10-28T10:00:00Z' }],
});
const threads = [
  thread('t-landed', 'src/pricing.ts', 12, 'This can go below zero with a big coupon.'),
  thread('t-pending', 'src/pricing.ts', 40, 'Name this `applyCoupon`, it reads better.'),
];
const replies: Reply[] = [
  { thread: 't-landed', verdict: 'fixed', reply: 'Good catch, the total is clamped at zero now.', resolve: true, commit: 'a1a1a1a1a1a1' },
  { thread: 't-pending', verdict: 'fixed', reply: 'Renamed it.', resolve: true, commit: 'b2b2b2b2b2b2' },
];
const fixes = (over: Partial<FixesStatus> = {}): FixesStatus => ({
  ref: 'marginalia/feat-coupons', branch: 'feat/coupons', state: 'ready', fixesSha: 'b2b2b2b2b2b2', remoteSha: 'c3c3c3c3c3c3',
  commits: [{ sha: 'b2b2b2b2b2b2b2b2', subject: 'fix: rename to applyCoupon', thread: 't-pending', merge: false }],
  landed: [{ thread: 't-landed', sha: 'd4d4d4d4d4d4' }],
  ...over,
});

const meta = {
  title: 'Scholia/Replies/RepliesPanel',
  component: RepliesPanel,
  args: { slug: 'webapp/feat-coupons', threads, replies, posted: {}, fixes: fixes(), onFixes: () => {}, locked: false, reload: () => {} },
  decorators: [(Story) => <div className="max-w-md"><Story /></div>],
} satisfies Meta<typeof RepliesPanel>;
export default meta;
type Story = StoryObj<typeof meta>;

// One fix already on the MR (its reply names the commit), the other still to push from its card.
export const OneLandedOneToPush: Story = {};
// The conflicts were settled by a merge the fixes sit on: it goes first.
export const MergeFirst: Story = {
  args: {
    fixes: fixes({
      commits: [
        { sha: 'b2b2b2b2b2b2b2b2', subject: 'fix: rename to applyCoupon', thread: 't-pending', merge: false },
        { sha: 'e5e5e5e5e5e5e5e5', subject: 'Merge develop into feat/coupons, settling the conflicts', thread: null, merge: true },
      ],
    }),
  },
};
