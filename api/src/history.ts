import { copyFile, mkdir, readFile, readdir, stat } from 'node:fs/promises';
import { join } from 'node:path';

// Previous versions of a review, kept by the artifact (artifact.ts). A re-run overwrites
// <slug>.md, so the file it replaces is first copied to .history/<slug>/<timestamp>.md (the
// timestamp is when that version was written). The dot-directory keeps these out of the studio's
// review list, which only reads *.md at the top of the reviews dir.
const idOf = (date: Date) => date.toISOString().replace(/[:.]/g, '-');
// The ISO time an id stands for (the reverse of idOf).
export const versionTime = (id: string) => id.replace(/^(\d{4}-\d{2}-\d{2}T\d{2})-(\d{2})-(\d{2})-(\d{3})Z$/, '$1:$2:$3.$4Z');

// The versions of the review whose files are `markdownPath` and `shapePath`, kept in `dir`.
export function historyIn(dir: string, markdownPath: string, shapePath: string) {
  return {
    // Copies the review aside if it exists and differs from `nextContent`. Returns the version id,
    // or null when there was nothing to keep.
    async keep(nextContent: string) {
      let previous;
      let mtime;
      try {
        [previous, mtime] = await Promise.all([readFile(markdownPath, 'utf8'), stat(markdownPath).then((s) => s.mtime)]);
      } catch {
        return null;
      }
      if (previous === nextContent) return null;
      const id = idOf(mtime);
      await mkdir(dir, { recursive: true });
      await copyFile(markdownPath, join(dir, `${id}.md`));
      // The normalized findings that went with it, when it had them.
      await copyFile(shapePath, join(dir, `${id}.findings.json`)).catch(() => {});
      return id;
    },

    // Versions, newest first.
    async list() {
      let names: string[] = [];
      try {
        names = (await readdir(dir)).filter((n) => n.endsWith('.md'));
      } catch {
        return [];
      }
      return names
        .map((n) => n.slice(0, -3))
        .sort()
        .reverse()
        .map((id) => ({ id, at: versionTime(id) }));
    },

    // { markdown, shape } of one version; shape is null for a version kept before findings were
    // stored (the caller derives one from the markdown).
    async read(id: string) {
      if (!/^[\w-]+$/.test(id)) return null;
      try {
        const markdown = await readFile(join(dir, `${id}.md`), 'utf8');
        const shape = await readFile(join(dir, `${id}.findings.json`), 'utf8').then(JSON.parse, () => null);
        return { markdown, shape };
      } catch {
        return null;
      }
    },
  };
}
