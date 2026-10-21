// Interactive first-time setup: `marginalia init` (or `npm run init`). Asks the few
// things that can't be guessed, checks each answer live, and writes config.json in the
// data directory. An existing config.json or .env only supplies the defaults.
import '../lib/node-check.mjs';
import { existsSync, readFileSync, writeFileSync, mkdirSync, chmodSync, copyFileSync } from 'node:fs';
import { spawnSync } from 'node:child_process';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import * as p from '@clack/prompts';
import { resolveDataDir } from '../lib/paths-home.mjs';
import { readConfigFile, CONFIG_FILENAME } from '../lib/config-file.mjs';
import { parseEnv, defaultsFromEnv, projectFromAnswers, buildConfig } from '../lib/init-config.mjs';
import { checkToken, checkProject, checkRepo, findCommands, copyStarters, expandHome, findEnvFile } from './init-checks.mjs';

const ROOT = join(dirname(fileURLToPath(import.meta.url)), '..');

// A prompt answer, or exit cleanly when the user cancels (Ctrl-C).
const ask = async (promise) => {
  const value = await promise;
  if (p.isCancel(value)) { p.cancel('Aborted, nothing written.'); process.exit(1); }
  return value;
};
const text = (message, initialValue = '', validate) => ask(p.text({ message, initialValue, validate: validate ?? ((v) => (v.trim() ? undefined : 'required')) }));
// Validates with `check` until it passes, or the user gives up.
async function until(message, initial, check) {
  for (;;) {
    const value = await text(message, initial);
    try { return { value, result: await check(value) }; } catch (err) {
      p.log.error(err.message);
      if (!(await ask(p.confirm({ message: 'Try again?', initialValue: true })))) { p.cancel('Aborted, nothing written.'); process.exit(1); }
      initial = value;
    }
  }
}

const envDefaults = (dataDir) => {
  const file = findEnvFile(dataDir, ROOT);
  return file ? defaultsFromEnv(parseEnv(readFileSync(file, 'utf8'))) : { project: {} };
};

async function askCommands(repoPath, d) {
  let found = findCommands(repoPath);
  if (!found.length) {
    p.log.warn('No slash commands found in the repo\'s .claude/ or ~/.claude/.');
    if (await ask(p.confirm({ message: `Copy the starter commands and agent from examples/ into ${join(repoPath, '.claude')}?` }))) {
      copyStarters(ROOT, repoPath);
      found = ['/review', '/triage'];
      p.log.success('Copied (edit them to fit your team).');
    }
  }
  const options = found.map((c) => ({ value: c, label: c }));
  const reviewCommand = found.length
    ? await ask(p.select({ message: 'Command that reviews other people\'s MRs', options, initialValue: found.includes(d.reviewCommand) ? d.reviewCommand : found[0] }))
    : await text('Command that reviews other people\'s MRs', d.reviewCommand || '/code-review');
  const triageCommand = await ask(p.select({
    message: 'Command that triages reviewer comments on YOUR MRs (none = your own MRs are ignored)',
    options: [...options, { value: '', label: 'none' }],
    initialValue: found.includes(d.triageCommand) ? d.triageCommand : '',
  }));
  return { reviewCommand, triageCommand };
}

async function askProject(shared, d = {}) {
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
  const commands = await askCommands(repo.result, d);
  const allowedTargetBranches = await ask(p.text({ message: 'Only review MRs targeting these branches (comma-separated, empty = all)', initialValue: Array.isArray(d.allowedTargetBranches) ? d.allowedTargetBranches.join(',') : (d.allowedTargetBranches ?? '') }));
  return projectFromAnswers({ gitlabProjectId: gitlabProjectId.value.trim(), repoLocalPath: repo.result, kind, ...commands, allowedTargetBranches, key: d.key, excludeAuthors: d.excludeAuthors });
}

async function askShared(d) {
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
  let previous = null;
  try { previous = readConfigFile(dataDir); } catch (err) { p.log.warn(`${err.message.split('\n')[0]}\nIgnoring it, the answers below replace it.`); }
  const fromEnv = envDefaults(dataDir);
  p.intro('Marginalia setup');
  const shared = await askShared(previous ?? fromEnv);
  const queue = previous ? [...previous.projects] : [fromEnv.project];
  const projects = [];
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
    const r = spawnSync(process.execPath, [join(ROOT, 'scripts', 'doctor.mjs')], { stdio: 'inherit', env: process.env });
    if (r.status === 0) p.outro('Ready: marginalia start (or `marginalia doctor --dry-run <iid>` to try one MR first).');
    return r.status ?? 1;
  }
  p.outro('Done. Next: marginalia doctor');
  return 0;
}

if (process.argv[1] === fileURLToPath(import.meta.url)) process.exit(await runInit());
