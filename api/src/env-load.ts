import { config } from 'dotenv';
import { join } from 'node:path';
import { findCloneRoot } from './paths-home.ts';
import { PACKAGE_ROOT } from './package-root.ts';

// Loads the .env of a clone (beside the package, or at the repo root above it), then the one in
// the current directory. Imported first by config.ts, so the rest of it reads the variables.
const clone = findCloneRoot(PACKAGE_ROOT);
if (clone) config({ path: join(clone, '.env') });
config();
