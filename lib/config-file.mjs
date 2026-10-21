import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { parseConfig } from './config-schema.mjs';
import { envFromConfig } from './config-env.mjs';

export const CONFIG_FILENAME = 'config.json';

// The variables a config.json in `dir` stands for, or {} when there is none.
// A file that exists but is invalid fails loudly: silently falling back to .env
// would make the bot watch a different project than the one written down.
export function envFromConfigFile(dir) {
  let text;
  try {
    text = readFileSync(join(dir, CONFIG_FILENAME), 'utf8');
  } catch {
    return {};
  }
  let raw;
  try {
    raw = JSON.parse(text);
  } catch (err) {
    throw new Error(`${join(dir, CONFIG_FILENAME)} is not valid JSON: ${err.message}`);
  }
  const result = parseConfig(raw);
  if (!result.ok) throw new Error(`${join(dir, CONFIG_FILENAME)} is invalid:\n  ${result.errors.join('\n  ')}`);
  if (result.config.projects.length > 1) {
    console.warn(`${CONFIG_FILENAME} lists ${result.config.projects.length} projects: only the first is watched until multi-project polling lands.`);
  }
  return envFromConfig(result.config);
}
