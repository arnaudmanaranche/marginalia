import type { Meta, StoryObj } from '@storybook/react-vite';
import { ExternalLink, Settings } from 'lucide-react';
import { TipLayer } from './TipLayer';

// The studio's tooltip: hover or tab to an icon-only control marked `data-tip`; the tip stays while the
// pointer moves onto it, and Escape dismisses it.
const meta = { title: 'Scholia/Design system/Tooltip', component: TipLayer } satisfies Meta<typeof TipLayer>;
export default meta;
type Story = StoryObj<typeof meta>;

const icon = 'inline-flex size-9 items-center justify-center rounded-lg border border-line bg-surface hover:bg-sunken';

export const IconControls: Story = {
  render: () => (
    <div className="flex gap-3 p-10">
      <TipLayer />
      <button type="button" aria-label="Settings" data-tip="Settings" className={icon}><Settings className="size-4" /></button>
      <a href="#" aria-label="Open in GitLab" data-tip="Open in GitLab" className={icon}><ExternalLink className="size-4" /></a>
      <button type="button" aria-label="Close tab" data-tip="Close tab (Ctrl+W or ⌥W)" className={icon}>×</button>
    </div>
  ),
};
