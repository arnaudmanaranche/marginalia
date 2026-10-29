// @ts-check
import { config } from 'dotenv';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { findCloneRoot } from './paths-home.mjs';

// Loads the .env of a clone (beside the package, or at the repo root above it), then the one in
// the current directory. Imported first by config.mjs, so the rest of it reads the variables.
const clone = findCloneRoot(join(dirname(fileURLToPath(import.meta.url)), '..'));
if (clone) config({ path: join(clone, '.env') });
config();
