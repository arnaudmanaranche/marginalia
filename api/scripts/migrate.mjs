// `marginalia migrate`: turns the current .env into a single-project config.json in the
// data directory. Writes one file and touches nothing else: the .env stays as it is.
import { existsSync, readFileSync, writeFileSync, mkdirSync, chmodSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { resolveDataDir } from '../src/paths-home.mjs';
import { CONFIG_FILENAME } from '../src/config-file.mjs';
import { parseEnv, migrateEnv } from '../src/init-config.mjs';
import { findEnvFile } from './init-checks.mjs';

const ROOT = join(dirname(fileURLToPath(import.meta.url)), '..');

// Returns an exit code. `dataDir` and `envFile` are injectable for tests and for
// `MARGINALIA_HOME`-style setups; they default to where the bot itself looks.
export function runMigrate({ force = false, dataDir = resolveDataDir({ root: ROOT }), envFile = findEnvFile(dataDir, ROOT), log = console.log } = {}) {
  const target = join(dataDir, CONFIG_FILENAME);
  if (existsSync(target) && !force) {
    log(`${target} already exists: not overwriting it. Use --force to replace it.`);
    return 1;
  }
  if (!envFile) {
    log('No .env found (looked in the data directory, the install folder and here): nothing to migrate. Run `marginalia init`.');
    return 1;
  }
  const result = migrateEnv(parseEnv(readFileSync(envFile, 'utf8')));
  if (!result.ok) {
    log(`${envFile} is not complete enough for a config.json:\n  ${result.errors.join('\n  ')}\nFix it, or run \`marginalia init\`.`);
    return 1;
  }
  mkdirSync(dataDir, { recursive: true });
  writeFileSync(target, `${JSON.stringify(result.raw, null, 2)}\n`, { mode: 0o600 });
  chmodSync(target, 0o600);
  log(`Wrote ${target} (1 project: ${result.raw.projects[0].gitlabProjectId}) from ${envFile}.
The .env was left untouched.`);
  if (result.stillInEnv.length) log(`config.json does not carry these, so keep them in the .env: ${result.stillInEnv.join(', ')}.`);
  log('Next: marginalia doctor, then `marginalia init` to add a second project.');
  return 0;
}
