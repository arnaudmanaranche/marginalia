import { join } from 'node:path';

// The skills a run can pick from: ours and the team's in one list, a team skill replacing a
// built-in of the same name. Pure planning; catalog-assemble.ts does the I/O.
export const CATALOG_PLUGIN = 'marginalia';
// The contract skill is always part of the catalog and no team skill may replace it.
export const CONTRACT_SKILL = 'marginalia-review';

export interface CatalogSkill { name: string; source: 'built-in' | 'team'; dir: string; description: string }
type Found = { name: string; dir: string; description: string };

/** @param {{ builtIn: Found[], team: Found[] }} input */
export function planCatalog({ builtIn, team }: { builtIn: Found[]; team: Found[] }): CatalogSkill[] {
  const byName = new Map<string, CatalogSkill>();
  for (const s of builtIn) byName.set(s.name, { ...s, source: 'built-in' });
  for (const s of team) if (s.name !== CONTRACT_SKILL) byName.set(s.name, { ...s, source: 'team' });
  return [...byName.values()].sort((a, b) => a.name.localeCompare(b.name));
}

// The `description:` line of a SKILL.md, or ''.
export function skillDescription(markdown: string): string {
  return markdown.match(/^---\n[\s\S]*?^description:[ \t]*(.+)$/m)?.[1].trim().replace(/^["']|["']$/g, '') ?? '';
}

// Where the plugin folder puts each skill: <pluginDir>/skills/<name> -> the skill's own folder.
export const catalogLinks = (pluginDir: string, skills: CatalogSkill[]) => skills.map((s) => ({ path: join(pluginDir, 'skills', s.name), target: s.dir }));

// What the agent is told about the catalog: pick what fits the change, the contract skill always.
export function catalogPrompt(skills: CatalogSkill[]): string {
  const lines = skills.filter((s) => s.name !== CONTRACT_SKILL).map((s) => `- ${CATALOG_PLUGIN}:${s.name}${s.source === 'team' ? ' (team)' : ''}: ${s.description}`);
  return [
    `Skills for this review (Skill tool): always follow ${CATALOG_PLUGIN}:${CONTRACT_SKILL}, it fixes the output. Load the others only when the change calls for them; a team skill is the team's own standard and wins over a built-in on the same point.`,
    ...lines,
  ].join('\n');
}
