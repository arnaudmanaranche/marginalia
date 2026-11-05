import type { Meta, StoryObj } from '@storybook/react-vite';
import { StatusMark } from './StatusMark';
import { ToolChip, ToolChips } from './ToolChip';
import { LivePill } from './LivePill';
import { Panel, PanelFooter, PanelHeader } from './Panel';
import { Timeline, TimelineItem } from './Timeline';
import { SpanBar } from './SpanBar';
import { Segmented } from './Segmented';
import { Chip } from './Chip';

// The design system's primitives side by side, in both themes (the toolbar switches them).
const meta = { title: 'Scholia/Design system/Primitives', component: StatusMark, args: { state: 'running' } } satisfies Meta<typeof StatusMark>;
export default meta;
type Story = StoryObj<typeof meta>;

export const Marks: Story = {
  render: () => (
    <div className="flex items-center gap-4 text-xs text-fg-muted">
      {(['done', 'running', 'pending', 'failed', 'skipped', 'current'] as const).map((s) => <span key={s} className="flex items-center gap-1.5"><StatusMark state={s} />{s}</span>)}
    </div>
  ),
};
export const Chips: Story = { render: () => <div className="flex flex-col gap-2"><ToolChip name="jira.search" /><ToolChips names={['read', 'git', 'grep', 'notion.fetch', 'slack.read_thread']} /></div> };
export const Pills: Story = {
  render: () => (
    <div className="flex flex-wrap gap-2">
      <LivePill tone="run" label="Running" detail="2m 19s" live />
      <LivePill tone="ok" label="Done" detail="36s" />
      <LivePill tone="fail" label="Failed" />
      <LivePill tone="warn" label="Retrying" />
      <LivePill tone="idle" label="Waiting" />
    </div>
  ),
};
export const PanelWithTimeline: Story = {
  render: () => (
    <Panel className="max-w-md">
      <PanelHeader title="Reviewing !4047" meta="/code-review · step 3 of 4" aside={<LivePill tone="run" label="Running" detail="1m 02s" live />} />
      <div className="border-t border-line px-4 py-4">
        <Timeline label="Example">
          <TimelineItem mark={<StatusMark state="done" />} walked aside="2s">Check out the MR branch</TimelineItem>
          <TimelineItem mark={<StatusMark state="running" />} walked={false} current aside="58s">Claude reviews the MR</TimelineItem>
          <TimelineItem mark={<StatusMark state="pending" />} walked={false} last aside="">Save the report</TimelineItem>
        </Timeline>
      </div>
      <PanelFooter><span>Running · 2 of 3</span><span className="tabular-nums">1m 02s</span></PanelFooter>
    </Panel>
  ),
};
export const Spans: Story = {
  render: () => (
    <div className="flex max-w-md flex-col gap-3">
      <SpanBar total={100} spans={[{ id: 'a', label: 'a', state: 'done', start: 0, end: 8 }, { id: 'b', label: 'b', state: 'done', start: 8, end: 20 }, { id: 'c', label: 'c', state: 'running', start: 20, end: 70 }]} />
      <SpanBar total={100} spans={[{ id: 'a', label: 'a', state: 'done', start: 0, end: 30 }, { id: 'b', label: 'b', state: 'failed', start: 30, end: 100 }]} />
      <SpanBar total={100} height="h-2" spans={[{ id: 'b', label: 'b', state: 'done', start: 40, end: 65 }]} />
    </div>
  ),
};
export const Segments: Story = {
  render: () => <Segmented label="Show jobs" value="all" onChange={() => {}} options={[{ id: 'all', label: 'All' }, { id: 'running', label: 'Running', count: 1 }, { id: 'failed', label: 'Failed', count: 4 }]} />,
};
export const Chips2: Story = {
  name: 'Facts',
  render: () => (
    <div className="flex flex-wrap items-center gap-1.5 text-xs text-fg-muted">
      <span>Touches</span><Chip>Checkout and payment</Chip><Chip>Agent sign-in and session refresh</Chip>
      <Chip mono title="Source branch">feat/COL-1049</Chip><Chip mono>COL-1049</Chip>
    </div>
  ),
};
