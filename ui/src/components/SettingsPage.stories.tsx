import type { Meta, StoryObj } from '@storybook/react-vite';
import { SettingsPage } from './SettingsPage';
import { QueryClientProvider } from '@tanstack/react-query';
import { queryClient } from '../lib/queryClient';
import type { Settings } from '../lib/api';

const settings: Settings = { pollIntervalMinutes: 5, staleAfterDays: 14, allowedTargetBranches: [], excludeAuthors: ['renovate-bot'], showFullDiff: true, dailyBudgetUsd: 25 };
const defaults: Settings = { ...settings, pollIntervalMinutes: 10, excludeAuthors: [] };

const meta = {
  title: 'Scholia/Pages/SettingsPage',
  component: SettingsPage,
  decorators: [(Story) => <QueryClientProvider client={queryClient}><Story /></QueryClientProvider>],
  args: { settings, defaults, projects: [{ key: 'webapp', kind: 'front', gitlabProjectId: 'platform/webapp', url: 'https://git.example.com/platform/webapp' }] },
} satisfies Meta<typeof SettingsPage>;
export default meta;
type Story = StoryObj<typeof meta>;

export const Default: Story = {};
export const SeveralProjects: Story = { args: { projects: [{ key: 'webapp', kind: 'front', gitlabProjectId: 'platform/webapp', url: null }, { key: 'api', kind: 'back', gitlabProjectId: 'platform/api', url: null }] } };
export const Loading: Story = { args: { settings: null, defaults: null } };
