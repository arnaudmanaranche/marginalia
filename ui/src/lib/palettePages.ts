import { ACTIVITY_ROUTE, APPROVALS_ROUTE, QUEUE_ROUTE, SETTINGS_ROUTE, contextRoute } from './hashRoute';

// The screens the command palette goes to besides reviews: every one of them, so none is reachable
// only from a link deep in another. `route` null is Home. `keywords` are what a person may type.
export interface PalettePage { label: string; hint: string; route: string | null; keywords: string[] }

export function palettePages(projects: { key: string }[]): PalettePage[] {
  return [
    { label: 'Home', hint: 'What changed, what needs you, the bot today', route: null, keywords: ['home', 'briefing', 'needs you'] },
    { label: 'Activity', hint: 'Every job the bot ran, by day', route: ACTIVITY_ROUTE, keywords: ['activity', 'jobs', 'runs', 'history', 'failed'] },
    { label: 'Queue', hint: 'What runs, what comes next, what ended', route: QUEUE_ROUTE, keywords: ['queue', 'tasks', 'workers', 'poll', 'budget'] },
    { label: 'Approvals', hint: 'Proposed comments waiting for your decision', route: APPROVALS_ROUTE, keywords: ['approvals', 'proposals', 'comments'] },
    { label: 'Settings', hint: 'Budget, polling, projects', route: SETTINGS_ROUTE, keywords: ['settings', 'budget', 'poll', 'projects', 'preferences'] },
    ...projects.map((p) => ({
      label: `${p.key} project context`,
      hint: 'What the factory learned: critical paths, glossary, stack',
      route: contextRoute(p.key),
      keywords: ['project', 'context', 'critical paths', 'glossary', 'stack', p.key],
    })),
  ];
}
