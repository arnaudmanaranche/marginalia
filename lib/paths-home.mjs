// @ts-check
import { homedir } from 'node:os';
import { existsSync } from 'node:fs';
import { join } from 'node:path';

// Where state.json, status.json, posted.json, runs.jsonl, settings.json and the
// optional config.json live. Pure given its inputs, so it is tested without a disk.
//
// 1. MARGINALIA_HOME, when set;
// 2. the install folder itself when it holds a .env (a clone set up before the
//    data dir existed keeps its files where they are);
// 3. $XDG_CONFIG_HOME/marginalia, else ~/.marginalia (a packaged install).
/**
 * @param {{ env?: NodeJS.ProcessEnv, root?: string, home?: string, exists?: (path: string) => boolean }} [options]
 */
export function resolveDataDir({ env = process.env, root, home = homedir(), exists = existsSync } = {}) {
  if (env.MARGINALIA_HOME) return env.MARGINALIA_HOME;
  if (root && exists(join(root, '.env'))) return root;
  return env.XDG_CONFIG_HOME ? join(env.XDG_CONFIG_HOME, 'marginalia') : join(home, '.marginalia');
}
