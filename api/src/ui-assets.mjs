// @ts-check
import { existsSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

const PACKAGE_ROOT = join(dirname(fileURLToPath(import.meta.url)), '..');

// Where the built studio is. A packaged install carries it next to the code (`prepack` copies
// it to ui-dist); in the repo it is the ui workspace's own build.
/** @param {string} [root] */
export const uiDistCandidates = (root = PACKAGE_ROOT) => [join(root, 'ui-dist'), join(root, '..', 'ui', 'dist')];

/**
 * The folder holding the built studio, or null when it is not built.
 * @param {string} [root]
 * @param {(path: string) => boolean} [exists]
 */
export const uiDist = (root = PACKAGE_ROOT, exists = existsSync) =>
  uiDistCandidates(root).find((dir) => exists(join(dir, 'index.html'))) ?? null;

// The logo of the desktop notification: the built one, else the source asset.
/**
 * @param {string} [root]
 * @param {(path: string) => boolean} [exists]
 */
export const logoPath = (root = PACKAGE_ROOT, exists = existsSync) =>
  [join(root, 'ui-dist', 'logo.png'), join(root, '..', 'ui', 'public', 'logo.png')].find(exists) ?? join(root, '..', 'ui', 'public', 'logo.png');
