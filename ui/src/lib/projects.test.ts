import { describe, expect, it } from 'vitest';
import type { ReviewItem } from './api';
import { ALL_PROJECTS, activeFilter, filterByProject, filterOptions, hasSeveralProjects, type ProjectInfo } from './projects';

const project = (key: string, kind: ProjectInfo['kind']): ProjectInfo => ({ key, kind, gitlabProjectId: key, url: null });
const item = (project: string) => ({ slug: `${project}/a.md`, project }) as ReviewItem;

const back = project('api', 'back');
const front = project('web', 'front');
const front2 = project('admin', 'front');

describe('filterOptions', () => {
  it('offers nothing with one project, so Home looks as it always did', () => {
    expect(hasSeveralProjects([back])).toBe(false);
    expect(filterOptions([back])).toEqual([]);
    expect(filterOptions(undefined)).toEqual([]);
  });

  it('lists All and each project', () => {
    expect(filterOptions([back, front])).toEqual([
      { value: 'all', label: 'All' },
      { value: 'key:api', label: 'api' },
      { value: 'key:web', label: 'web' },
    ]);
  });

  it('adds a side only when it groups several projects', () => {
    const values = filterOptions([back, front, front2]).map((o) => o.value);
    expect(values).toContain('kind:front');
    expect(values).not.toContain('kind:back');
  });
});

describe('filterByProject', () => {
  const items = [item('api'), item('web'), item('admin')];
  const projects = [back, front, front2];

  it('shows everything for All', () => {
    expect(filterByProject(items, ALL_PROJECTS, projects)).toBe(items);
  });
  it('keeps one project', () => {
    expect(filterByProject(items, 'key:web', projects).map((i) => i.project)).toEqual(['web']);
  });
  it('keeps one side of the stack', () => {
    expect(filterByProject(items, 'kind:front', projects).map((i) => i.project)).toEqual(['web', 'admin']);
  });
  it('falls back to everything when the project left the config', () => {
    expect(activeFilter('key:gone', projects)).toBe(ALL_PROJECTS);
    expect(filterByProject(items, 'key:gone', projects)).toBe(items);
  });
  it('ignores any filter with a single project', () => {
    expect(filterByProject(items, 'key:api', [back])).toBe(items);
  });
});
