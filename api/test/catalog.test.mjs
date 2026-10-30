import { test } from 'node:test';
import assert from 'node:assert/strict';
import { mkdtemp, mkdir, writeFile, readlink, readdir } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { CONTRACT_SKILL, catalogPrompt, planCatalog, skillDescription } from '../dist/src/catalog.js';
import { BUILT_IN_SKILLS, assembleCatalog, readSkills } from '../dist/src/catalog-assemble.js';

const skill = (name, description = `Use when ${name}.`) => ({ name, dir: `/s/${name}`, description });

test('a team skill replaces a built-in of the same name, the rest merge sorted', () => {
  const plan = planCatalog({ builtIn: [skill('security'), skill('tests')], team: [{ ...skill('security'), dir: '/t/security' }, skill('react-hooks')] });
  assert.deepEqual(plan.map((s) => [s.name, s.source]), [['react-hooks', 'team'], ['security', 'team'], ['tests', 'built-in']]);
  assert.equal(plan[1].dir, '/t/security');
});

test('no team skill can replace the contract skill', () => {
  const plan = planCatalog({ builtIn: [skill(CONTRACT_SKILL)], team: [{ ...skill(CONTRACT_SKILL), dir: '/t/evil' }] });
  assert.equal(plan[0].source, 'built-in');
  assert.equal(plan[0].dir, `/s/${CONTRACT_SKILL}`);
});

test('the description is read from the frontmatter', () => {
  assert.equal(skillDescription('---\nname: x\ndescription: Use when a thing.\n---\n# X'), 'Use when a thing.');
  assert.equal(skillDescription('# no frontmatter'), '');
});

test('the prompt lists the catalog, names the contract skill first and marks team skills', () => {
  const text = catalogPrompt(planCatalog({ builtIn: [skill(CONTRACT_SKILL), skill('tests')], team: [skill('react-hooks')] }));
  assert.match(text.split('\n')[0], /always follow marginalia:marginalia-review/);
  assert.match(text, /- marginalia:react-hooks \(team\): Use when react-hooks\./);
  assert.match(text, /- marginalia:tests: /);
  assert.doesNotMatch(text.split('\n').slice(1).join('\n'), /marginalia-review/);
});

test('the shipped built-ins are the contract skill and the seven global ones, each well formed', async () => {
  const found = await readSkills(BUILT_IN_SKILLS);
  assert.deepEqual(found.map((s) => s.name).sort(), ['compatibility', 'correctness', 'maintainability', CONTRACT_SKILL, 'performance', 'pr-hygiene', 'security', 'tests'].sort());
  for (const s of found) assert.match(s.description, /^(Use when|Review)/, `${s.name} says when to use it`);
});

test('the catalog folder links built-ins and team skills, and drops what is gone', async () => {
  const data = await mkdtemp(join(tmpdir(), 'marginalia-catalog-'));
  await mkdir(join(data, 'team', 'skills', 'security'), { recursive: true });
  await writeFile(join(data, 'team', 'skills', 'security', 'SKILL.md'), '---\nname: security\ndescription: Use when the team says.\n---\n');
  await mkdir(join(data, 'catalog', 'skills', 'stale'), { recursive: true });
  const { skills, args, deny } = await assembleCatalog(data);
  assert.deepEqual(args, ['--plugin-dir', join(data, 'catalog')]);
  assert.equal(await readlink(join(data, 'catalog', 'skills', 'security')), join(data, 'team', 'skills', 'security'));
  assert.equal(skills.find((s) => s.name === 'tests')?.source, 'built-in');
  assert.ok(!(await readdir(join(data, 'catalog', 'skills'))).includes('stale'));
  assert.ok(deny.some((d) => d.includes(join(data, 'catalog'))));
});
