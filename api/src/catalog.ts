import { join } from 'node:path';

// The skills a run can pick from: ours and the team's in one list, a team skill replacing a
// built-in of the same name. Pure planning; catalog-assemble.ts does the I/O.
export const CATALOG_PLUGIN = 'marginalia';

export interface CatalogSkill { name: string; source: 'built-in' | 'team'; dir: string; description: string }
type Found = { name: string; dir: string; description: string };

/** @param {{ builtIn: Found[], team: Found[] }} input */
export function planCatalog({ builtIn, team }: { builtIn: Found[]; team: Found[] }): CatalogSkill[] {
  const byName = new Map<string, CatalogSkill>();
  for (const s of builtIn) byName.set(s.name, { ...s, source: 'built-in' });
  for (const s of team) byName.set(s.name, { ...s, source: 'team' });
  return [...byName.values()].sort((a, b) => a.name.localeCompare(b.name));
}

// The `description:` line of a SKILL.md, or ''.
export function skillDescription(markdown: string): string {
  return markdown.match(/^---\n[\s\S]*?^description:[ \t]*(.+)$/m)?.[1].trim().replace(/^["']|["']$/g, '') ?? '';
}

// Where the plugin folder puts each skill: <pluginDir>/skills/<name> -> the skill's own folder.
export const catalogLinks = (pluginDir: string, skills: CatalogSkill[]) => skills.map((s) => ({ path: join(pluginDir, 'skills', s.name), target: s.dir }));

// What a chapter's reviewer is told about the catalog (pipeline/review.ts): the review lenses it may
// load for its files.
export function lensPrompt(lenses: CatalogSkill[]): string {
  if (!lenses.length) return '';
  return [
    'Review lenses you can load with the Skill tool: load the ones your files call for, before you judge them, and none that does not apply. A team lens is the team\'s own standard and wins over a built-in one on the same point.',
    ...lenses.map((s) => `- ${CATALOG_PLUGIN}:${s.name}${s.source === 'team' ? ' (team)' : ''}: ${s.description}`),
  ].join('\n');
}
