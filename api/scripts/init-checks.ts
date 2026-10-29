// The live checks `marginalia init` runs on each answer. Each returns data or
// throws an Error whose message is shown to the user as is.
import { existsSync, readdirSync, mkdirSync, copyFileSync } from 'node:fs';
import { execFileSync } from 'node:child_process';
import { homedir } from 'node:os';
import { join, basename } from 'node:path';
import { findCloneRoot } from '../src/paths-home.ts';

// The first .env found: the data dir's, then the install folder's, then the current directory's.
export const findEnvFile = (dataDir, root) => [join(dataDir, '.env'), join(findCloneRoot(root) ?? root, '.env'), join(process.cwd(), '.env')].find((f) => existsSync(f));

export const expandHome = (p) => String(p).trim().replace(/^~(?=$|\/)/, homedir());

const call = async (baseUrl, token, path) => {
  let res;
  try {
    res = await fetch(`${baseUrl}/api/v4${path}`, { headers: { 'PRIVATE-TOKEN': token } });
  } catch (err) {
    throw new Error(`${baseUrl} is not reachable (${err.cause?.code ?? err.message})`);
  }
  if (!res.ok) throw new Error(`${path} -> ${res.status}${res.status === 401 ? ' (token refused)' : ''}`);
  return res.json();
};

export const checkToken = async (baseUrl, token) => (await call(baseUrl, token, '/user')).username;

export async function checkProject(baseUrl, token, projectId) {
  const id = /^\d+$/.test(projectId) ? projectId : encodeURIComponent(projectId);
  return (await call(baseUrl, token, `/projects/${id}`)).path_with_namespace;
}

export function checkRepo(path) {
  try {
    execFileSync('git', ['remote', 'get-url', 'origin'], { cwd: path, stdio: 'ignore' });
  } catch {
    throw new Error('not a git repository with an "origin" remote');
  }
}

const listIn = (dir) => {
  try { return readdirSync(join(dir, 'commands')).filter((f) => f.endsWith('.md')).map((f) => `/${basename(f, '.md')}`); } catch { return []; }
};

// Slash commands the repo's .claude/ or ~/.claude/ already offers.
export const findCommands = (repoPath) => [...new Set([...listIn(join(repoPath, '.claude')), ...listIn(join(homedir(), '.claude'))])].sort();

export function copyStarters(root, repoPath) {
  const dest = join(repoPath, '.claude');
  for (const sub of ['commands', 'agents']) {
    mkdirSync(join(dest, sub), { recursive: true });
    for (const f of readdirSync(join(root, 'examples', sub))) copyFileSync(join(root, 'examples', sub, f), join(dest, sub, f));
  }
  return dest;
}
