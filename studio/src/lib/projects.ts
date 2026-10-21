import type { ReviewItem, ReviewsPayload } from './api';

export type ProjectInfo = ReviewsPayload['projects'][number];

// What Home is narrowed to: every project, one side of the stack (`kind:back`, `kind:front`) or one project (`key:<key>`).
export type ProjectFilter = string;
export const ALL_PROJECTS: ProjectFilter = 'all';

export interface FilterOption {
  value: ProjectFilter;
  label: string;
}

// The filter only exists when there is something to choose: with one project, Home looks as it always did.
export const hasSeveralProjects = (projects: ProjectInfo[] | undefined) => (projects?.length ?? 0) > 1;

export function filterOptions(projects: ProjectInfo[] | undefined): FilterOption[] {
  if (!projects || !hasSeveralProjects(projects)) return [];
  const sides = (['back', 'front'] as const).filter((k) => projects.filter((p) => p.kind === k).length > 1);
  return [
    { value: ALL_PROJECTS, label: 'All' },
    // A side is only worth a button when it groups more than one project.
    ...sides.map((k) => ({ value: `kind:${k}`, label: k === 'back' ? 'Back' : 'Front' })),
    ...projects.map((p) => ({ value: `key:${p.key}`, label: p.key })),
  ];
}

// A filter that no longer exists (a project left the config) shows everything rather than an empty page.
export function activeFilter(filter: ProjectFilter, projects: ProjectInfo[] | undefined): ProjectFilter {
  return filterOptions(projects).some((o) => o.value === filter) ? filter : ALL_PROJECTS;
}

export function filterByProject(items: ReviewItem[], filter: ProjectFilter, projects: ProjectInfo[] | undefined): ReviewItem[] {
  const active = activeFilter(filter, projects);
  if (active === ALL_PROJECTS) return items;
  if (active.startsWith('key:')) return items.filter((i) => i.project === active.slice(4));
  const kind = active.slice(5);
  const keys = new Set((projects ?? []).filter((p) => p.kind === kind).map((p) => p.key));
  return items.filter((i) => keys.has(i.project));
}
