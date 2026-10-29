import { existsSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

// The folder holding this package's package.json, whether the code runs from src/ or from the
// built dist/src/ (dist has no package.json of its own, so the search goes on up to the package).
export function findPackageRoot(from: string): string {
  for (let dir = from; ; dir = dirname(dir)) {
    if (existsSync(join(dir, 'package.json'))) return dir;
    if (dirname(dir) === dir) throw new Error(`no package.json above ${from}`);
  }
}

export const PACKAGE_ROOT = findPackageRoot(dirname(fileURLToPath(import.meta.url)));
