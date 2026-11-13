import { APPROVALS_ROUTE } from './approvalsApi';
import { contextRoute } from './contextApi';
import { SETTINGS_ROUTE } from './hashRoute';

// The screens the command palette goes to besides reviews: every one of them, so none is reachable
// only from a link deep in another. `route` null is Home. `keywords` are what a person may type.
export interface PalettePage { label: string; hint: string; route: string | null; keywords: string[] }

export function palettePages(projects: { key: string }[]): PalettePage[] {
  return [
    { label: 'Home', hint: 'What needs you, the queue, the activity', route: null, keywords: ['home', 'queue', 'activity', 'jobs'] },
    { label: 'Approvals', hint: 'Proposed comments waiting for your decision', route: APPROVALS_ROUTE, keywords: ['approvals', 'proposals', 'comments'] },
    { label: 'Settings', hint: 'Budget, polling, projects', route: SETTINGS_ROUTE, keywords: ['settings', 'budget', 'poll', 'projects', 'preferences'] },
    ...projects.map((p) => ({
      label: `${p.key} context`,
      hint: 'What the factory learned: critical paths, glossary, stack',
      route: contextRoute(p.key),
      keywords: ['project', 'context', 'critical paths', 'glossary', 'stack', p.key],
    })),
  ];
}
