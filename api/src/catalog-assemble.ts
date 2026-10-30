import { mkdir, readdir, readFile, rename, rm, symlink, writeFile } from 'node:fs/promises';
import { join } from 'node:path';
import { PACKAGE_ROOT } from './package-root.ts';
import { CATALOG_PLUGIN, catalogLinks, planCatalog, skillDescription, type CatalogSkill } from './catalog.ts';

// The I/O half of catalog.ts: builds <dataDir>/catalog, a plugin whose skills are the merged
// catalog, and tells a run where it is. Each link is replaced atomically, as in team-claude.ts.
export const BUILT_IN_SKILLS = join(PACKAGE_ROOT, 'skills');

// The skills (folders with a SKILL.md) under `dir`, with their descriptions.
export async function readSkills(dir: string) {
  const found: { name: string; dir: string; description: string }[] = [];
  for (const e of (await readdir(dir, { withFileTypes: true }).catch(() => [])).filter((x) => x.isDirectory())) {
    const text = await readFile(join(dir, e.name, 'SKILL.md'), 'utf8').catch(() => null);
    if (text !== null) found.push({ name: e.name, dir: join(dir, e.name), description: skillDescription(text) });
  }
  return found;
}

export async function assembleCatalog(dataDir: string, builtInDir = BUILT_IN_SKILLS): Promise<{ skills: CatalogSkill[]; args: string[]; deny: string[] }> {
  const skills = planCatalog({ builtIn: await readSkills(builtInDir), team: await readSkills(join(dataDir, 'team', 'skills')) });
  const pluginDir = join(dataDir, 'catalog');
  const manifest = join(pluginDir, '.claude-plugin', 'plugin.json');
  await mkdir(join(pluginDir, '.claude-plugin'), { recursive: true });
  await mkdir(join(pluginDir, 'skills'), { recursive: true });
  const tmp = `${manifest}.tmp-${process.pid}`;
  await writeFile(tmp, `${JSON.stringify({ name: CATALOG_PLUGIN, description: 'The review skills of marginalia and of the team, merged' }, null, 2)}\n`);
  await rename(tmp, manifest);
  const links = catalogLinks(pluginDir, skills);
  for (const { path, target } of links) {
    await rm(`${path}.tmp-${process.pid}`, { force: true });
    await symlink(target, `${path}.tmp-${process.pid}`, 'dir');
    await rename(`${path}.tmp-${process.pid}`, path);
  }
  const wanted = new Set(links.map((l) => l.path));
  for (const e of await readdir(join(pluginDir, 'skills'))) if (!wanted.has(join(pluginDir, 'skills', e))) await rm(join(pluginDir, 'skills', e), { recursive: true, force: true });
  // Read-only for the run, like the team files: a prompt-injected run must not rewrite what every later review follows.
  return { skills, args: ['--plugin-dir', pluginDir], deny: [`Edit(/${pluginDir}/**)`, `Edit(/${builtInDir}/**)`] };
}
