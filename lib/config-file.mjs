import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { parseConfig } from './config-schema.mjs';

export const CONFIG_FILENAME = 'config.json';

// The validated config.json in `dir`, or null when there is none. A file that
// exists but is invalid fails loudly: silently falling back to .env would make
// the bot watch a different project than the one written down.
export function readConfigFile(dir) {
  const file = join(dir, CONFIG_FILENAME);
  let text;
  try {
    text = readFileSync(file, 'utf8');
  } catch {
    return null;
  }
  let raw;
  try {
    raw = JSON.parse(text);
  } catch (err) {
    throw new Error(`${file} is not valid JSON: ${err.message}`);
  }
  const result = parseConfig(raw);
  if (!result.ok) throw new Error(`${file} is invalid:\n  ${result.errors.join('\n  ')}`);
  return result.config;
}
