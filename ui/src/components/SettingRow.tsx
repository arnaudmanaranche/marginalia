import { Panel, PanelHeader } from './ds/Panel';

// A group of settings: a panel with a title and what the group is about, its rows divided by
// hairlines (the design system's Panel, so Settings reads like the rest of the studio).
export function SettingGroup({ title, description, children }: { title: string; description: React.ReactNode; children: React.ReactNode }) {
  return (
    <Panel label={title} className="mt-6">
      <PanelHeader title={title} meta={<span className="whitespace-normal">{description}</span>} />
      <div className="divide-y divide-line border-t border-line">{children}</div>
    </Panel>
  );
}

// One setting: what it is and why on the left, the control on the right (under it on a narrow screen).
export function SettingRow({ label, hint, htmlFor, hintId, children }: { label: string; hint: React.ReactNode; htmlFor?: string; hintId?: string; children: React.ReactNode }) {
  return (
    <div className="grid gap-x-6 gap-y-2 px-4 py-4 sm:grid-cols-[minmax(0,1fr)_minmax(0,18rem)] sm:items-start">
      <div className="min-w-0">
        <label htmlFor={htmlFor} className="block text-sm font-medium">{label}</label>
        <p id={hintId} className="mt-0.5 text-xs leading-5 text-fg-muted">{hint}</p>
      </div>
      <div className="flex items-center gap-2 sm:justify-end">{children}</div>
    </div>
  );
}
