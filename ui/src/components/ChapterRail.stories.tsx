import type { Meta, StoryObj } from '@storybook/react-vite';
import { ChapterRail } from './ChapterRail';
import type { Finding, TourStop } from '../lib/api';

const stop = (id: string, title: string, findingIds: string[] = [], supporting = false): TourStop => ({ id, title, summary: null, files: [], findingIds, supporting });
const finding = (id: string, severity: Finding['severity']) => ({ id, severity, title: id, path: null, line: null, body: '', comment: null } as Finding);
const stops = [
  stop('a', 'Open countries and destinations drawn on the map', ['a1', 'a2']),
  stop('b', 'Catalogue and destinations on the steps page', ['b1']),
  stop('c', 'Sidebar maps reuse the catalogue, and the inspiration page loses its own copy', ['c1']),
  stop('d', 'Generated tables, documentation and tests', ['d1'], true),
];
const findings = [finding('a1', 'important'), finding('a2', 'suggestion'), finding('b1', 'critical'), finding('c1', 'suggestion'), finding('d1', 'info')];

const meta = {
  title: 'Scholia/Data display/ChapterRail',
  component: ChapterRail,
  args: { stops, findings, index: 1, direction: 1, onGo: () => {}, children: <p className="mt-1 text-sm text-fg-muted">One hook builds the catalogue for both maps. Check the step-id match between trip locations and catalogue items.</p> },
  decorators: [(S) => <div className="w-[26rem] rounded-xl border border-line bg-surface px-4 pb-4"><S /></div>],
} satisfies Meta<typeof ChapterRail>;
export default meta;
type Story = StoryObj<typeof meta>;

export const Middle: Story = {};
export const First: Story = { args: { index: 0 } };
export const Last: Story = { args: { index: 3 } };
