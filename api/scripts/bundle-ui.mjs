// Run by `prepack`: builds the studio and copies it next to the code as ui-dist, which is what
// a packaged install serves (see src/ui-assets.mjs).
import { cpSync, existsSync, rmSync } from 'node:fs';
import { execFileSync } from 'node:child_process';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

const API = join(dirname(fileURLToPath(import.meta.url)), '..');
const dist = join(API, '..', 'ui', 'dist');

execFileSync('npm', ['--workspace', 'ui', 'run', 'build'], { cwd: join(API, '..'), stdio: 'inherit' });
if (!existsSync(join(dist, 'index.html'))) throw new Error(`the studio build left no ${dist}/index.html`);
rmSync(join(API, 'ui-dist'), { recursive: true, force: true });
cpSync(dist, join(API, 'ui-dist'), { recursive: true });
