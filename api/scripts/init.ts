// Interactive first-time setup: `marginalia init` (or `npm run init`). Asks the few
// things that can't be guessed, checks each answer live, and writes config.json in the
// data directory. An existing config.json or .env only supplies the defaults.
import { PACKAGE_ROOT } from '../src/package-root.ts';
import '../src/node-check.ts';
import { existsSync, readFileSync, writeFileSync, mkdirSync, chmodSync, copyFileSync } from 'node:fs';
import { spawnSync } from 'node:child_process';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import * as p from '@clack/prompts';
import { resolveDataDir } from '../src/paths-home.ts';
import { readConfigFile, CONFIG_FILENAME } from '../src/config-file.ts';
import { parseEnv, defaultsFromEnv, projectFromAnswers, buildConfig } from '../src/init-config.ts';
import { checkToken, checkProject, checkRepo, expandHome, findEnvFile } from './init-checks.ts';

const ROOT = PACKAGE_ROOT;

// A prompt answer, or exit cleanly when the user cancels (Ctrl-C).
const ask = async (promise: any) => {
  const value = await promise;
  if (p.isCancel(value)) { p.cancel('Aborted, nothing written.'); process.exit(1); }
  return value;
};
const text = (message: string, initialValue = '', validate?: (v: string | undefined) => string | undefined) => ask(p.text({ message, initialValue, validate: validate ?? ((v) => (v?.trim() ? undefined : 'required')) }));
// Validates with `check` until it passes, or the user gives up.
async function until(message: string, initial: string | undefined, check: (value: string) => any) {
  for (;;) {
    const value = await text(message, initial);
    try { return { value, result: await check(value) }; } catch (err) {
      p.log.error(err.message);
      if (!(await ask(p.confirm({ message: 'Try again?', initialValue: true })))) { p.cancel('Aborted, nothing written.'); process.exit(1); }
      initial = value;
    }
  }
}

const envDefaults = (dataDir: string) => {
  const file = findEnvFile(dataDir, ROOT);
  return file ? defaultsFromEnv(parseEnv(readFileSync(file, 'utf8'))) : { project: {} };
};

async function askProject(shared: Record<string, any>, d: Record<string, any> = {}) {
  const gitlabProjectId = await until('GitLab project (numeric id or group/project path)', d.gitlabProjectId, async (id) => {
    const path = await checkProject(shared.gitlabBaseUrl, shared.gitlabToken, id.trim());
    p.log.success(`${path} reachable`);
    return path;
  });
  const repo = await until('Path of your local checkout of that repo', d.repoLocalPath, (v) => { checkRepo(expandHome(v)); return expandHome(v); });
  p.log.success('git repository with an origin remote');
  const kind = await ask(p.select({
    message: 'What is it?',
    options: [{ value: 'back', label: 'back-end' }, { value: 'front', label: 'front-end' }, { value: 'other', label: 'something else' }],
    initialValue: d.kind ?? 'back',
  }));
  const triage = await ask(p.confirm({ message: 'Triage the reviewer comments on your own MRs (answer them, fix what is right)?', initialValue: d.triage ?? true }));
  const allowedTargetBranches = await ask(p.text({ message: 'Only review MRs targeting these branches (comma-separated, empty = all)', initialValue: Array.isArray(d.allowedTargetBranches) ? d.allowedTargetBranches.join(',') : (d.allowedTargetBranches ?? '') }));
  return projectFromAnswers({ gitlabProjectId: gitlabProjectId.value.trim(), repoLocalPath: repo.result, kind, triage, allowedTargetBranches, key: d.key, excludeAuthors: d.excludeAuthors });
}

async function askShared(d: any) {
  p.log.info('Token: personal access token with the "api" scope (GitLab > Preferences > Access tokens).');
  const gitlabBaseUrl = (await text('GitLab URL', d.gitlabBaseUrl || 'https://gitlab.com')).trim().replace(/\/+$/, '');
  for (;;) {
    const gitlabToken = (await ask(p.password({ message: d.gitlabToken ? 'GitLab token (Enter keeps the saved one)' : 'GitLab token', validate: (v) => (v || d.gitlabToken ? undefined : 'required') }))) || d.gitlabToken;
    try {
      const gitlabUsername = await checkToken(gitlabBaseUrl, gitlabToken);
      p.log.success(`Logged in as ${gitlabUsername}`);
      return { gitlabBaseUrl, gitlabToken, gitlabUsername, claudeBin: d.claudeBin };
    } catch (err) {
      p.log.error(err.message);
      if (!(await ask(p.confirm({ message: 'Try again?', initialValue: true })))) { p.cancel('Aborted, nothing written.'); process.exit(1); }
    }
  }
}

export async function runInit() {
  if (!process.stdin.isTTY) {
    console.error('marginalia init is interactive: run it in a terminal, or write config.json by hand (see the README, "Several projects").');
    return 1;
  }
  const dataDir = resolveDataDir({ root: ROOT });
  let previous: ReturnType<typeof readConfigFile> = null;
  try { previous = readConfigFile(dataDir); } catch (err) { p.log.warn(`${err.message.split('\n')[0]}\nIgnoring it, the answers below replace it.`); }
  const fromEnv = envDefaults(dataDir);
  p.intro('Marginalia setup');
  const shared = await askShared(previous ?? fromEnv);
  const queue = previous ? [...previous.projects] : [fromEnv.project];
  const projects: any[] = [];
  for (;;) {
    projects.push(await askProject(shared, queue.shift()));
    if (queue.length) continue;
    if (!(await ask(p.confirm({ message: 'Add another project? (a back and a front repo are two projects)', initialValue: false })))) break;
  }
  const built = buildConfig({ shared, projects, previous: previous ?? {} });
  if (!built.ok) { p.log.error(`Invalid answers:\n  ${built.errors.join('\n  ')}`); return 1; }
  const file = join(dataDir, CONFIG_FILENAME);
  mkdirSync(dataDir, { recursive: true });
  if (existsSync(file)) copyFileSync(file, `${file}.bak`);
  writeFileSync(file, `${JSON.stringify(built.raw, null, 2)}\n`, { mode: 0o600 });
  chmodSync(file, 0o600);
  p.log.success(`${file} written${existsSync(`${file}.bak`) ? ' (previous one saved as config.json.bak)' : ''}`);
  if (await ask(p.confirm({ message: 'Run the checks now (marginalia doctor)?' }))) {
    const r = spawnSync(process.execPath, [join(dirname(fileURLToPath(import.meta.url)), 'doctor.js')], { stdio: 'inherit', env: process.env });
    if (r.status === 0) p.outro('Ready: marginalia start (or `marginalia doctor --dry-run <iid>` to try one MR first).');
    return r.status ?? 1;
  }
  p.outro('Done. Next: marginalia doctor');
  return 0;
}

if (process.argv[1] === fileURLToPath(import.meta.url)) process.exit(await runInit());
