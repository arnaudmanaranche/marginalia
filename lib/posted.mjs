import { readFile, writeFile, rename } from 'node:fs/promises';
import { POSTED_FILE } from './config.mjs';
import { PROJECTS } from './projects.mjs';
import { migratePosted } from './state-shape.mjs';

// Record of comments posted from the studio, keyed by `<project>/<review slug>:<comment id>`,
// so the same comment can't be posted twice. { at, iid, url }
export async function loadPosted() {
  try {
    return migratePosted(JSON.parse(await readFile(POSTED_FILE, 'utf8')), PROJECTS[0]?.key);
  } catch {
    return {};
  }
}

export async function savePosted(posted) {
  const tmp = `${POSTED_FILE}.tmp`;
  await writeFile(tmp, JSON.stringify(posted, null, 2));
  await rename(tmp, POSTED_FILE);
}
