import { copyFile, mkdir, readFile, readdir, stat } from 'node:fs/promises';
import { join } from 'node:path';

// Previous versions of a review, kept by the artifact (artifact.ts). A re-run overwrites
// <slug>.md, so the file it replaces is first copied to .history/<slug>/<timestamp>.md (the
// timestamp is when that version was written, see writtenAt). The dot-directory keeps these out of the studio's
// review list, which only reads *.md at the top of the reviews dir.
const idOf = (date: Date) => date.toISOString().replace(/[:.]/g, '-');
// The ISO time an id stands for (the reverse of idOf).
export const versionTime = (id: string) => id.replace(/^(\d{4}-\d{2}-\d{2}T\d{2})-(\d{2})-(\d{2})-(\d{3})Z$/, '$1:$2:$3.$4Z');

// When a review was written, in ms: the time its shape stores, since copying the reviews dir (a
// backup, a move into a volume) resets file times; the markdown's file time when it stores none
// (a review written before shapes were); null when there is no review.
export async function writtenAt(markdownPath: string, shapePath: string) {
  const file = await stat(markdownPath).catch(() => null);
  if (!file) return null;
  const stored = await readFile(shapePath, 'utf8').then((t) => Date.parse(JSON.parse(t).generatedAt), () => NaN);
  return Number.isFinite(stored) ? stored : file.mtimeMs;
}

// The versions of the review whose files are `markdownPath` and `shapePath`, kept in `dir`.
export function historyIn(dir: string, markdownPath: string, shapePath: string) {
  return {
    // Copies the review aside if it exists and differs from `nextContent`. Returns the version id,
    // or null when there was nothing to keep.
    async keep(nextContent: string) {
      const [previous, at] = await Promise.all([readFile(markdownPath, 'utf8').catch(() => null), writtenAt(markdownPath, shapePath)]);
      if (previous === null || at === null || previous === nextContent) return null;
      const id = idOf(new Date(at));
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
