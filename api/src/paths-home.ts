import { homedir } from 'node:os';
import { existsSync } from 'node:fs';
import { join } from 'node:path';

// Where state.json, status.json, posted.json, runs.jsonl, settings.json and the
// optional config.json live. Pure given its inputs, so it is tested without a disk.
//
// 1. MARGINALIA_HOME, when set;
// 2. the install folder itself when it holds a .env (a clone set up before the
//    data dir existed keeps its files where they are);
//    A clone keeps its .env at the root of the repo, one folder above the api package.
// 3. $XDG_CONFIG_HOME/marginalia, else ~/.marginalia (a packaged install).
// The folder of a clone that holds the .env: the package folder, or the repo root above it.
/**
 * @param {string} root
 * @param {(path: string) => boolean} [exists]
 */
export const findCloneRoot = (root, exists = existsSync) => [root, join(root, '..')].find((dir) => exists(join(dir, '.env'))) ?? null;

/**
 * @param {{ env?: NodeJS.ProcessEnv, root?: string, home?: string, exists?: (path: string) => boolean }} [options]
 */
export function resolveDataDir({ env = process.env, root, home = homedir(), exists = existsSync }: { env?: NodeJS.ProcessEnv; root?: string; home?: string; exists?: (path: any) => boolean } = {}) {
  if (env.MARGINALIA_HOME) return env.MARGINALIA_HOME;
  const clone = root ? findCloneRoot(root, exists) : null;
  if (clone) return clone;
  return env.XDG_CONFIG_HOME ? join(env.XDG_CONFIG_HOME, 'marginalia') : join(home, '.marginalia');
}
