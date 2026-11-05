import { readFile, writeFile } from 'node:fs/promises';
import { basename, dirname, join } from 'node:path';
import { buildShape } from './findings.ts';
import { historyIn } from './history.ts';

// The review of one MR as it is kept in the reviews dir: <slug>.md, <slug>.findings.json (the
// normalized shape, with the head commit the run read) and the earlier versions of both under
// .history/<slug>/. This is the one place that knows those names and the order they are written
// in; the runner and the studio both go through it.
export function artifactAt(reviewsDir: string, slug: string) {
  const markdownPath = join(reviewsDir, `${slug}.md`);
  const shapePath = join(reviewsDir, `${slug}.findings.json`);
  const history = historyIn(join(reviewsDir, '.history', slug), markdownPath, shapePath);
  return {
    markdownPath,
    listHistory: history.list,
    readHistory: history.read,

    // Stores a run's report. The review it replaces is kept first, unless it reads the same; returns
    // that version's id, or null. `reviewedSha` is the head commit the run read: it is what lets the
    // studio show the code this review covered.
    /** @param {{ content: string, shape: any }} report @param {string | null} [reviewedSha] */
    async write({ content, shape }: { content: string; shape: any }, reviewedSha: string | null = null) {
      const kept = await history.keep(content);
      await writeFile(markdownPath, content);
      const stored = { ...shape, generatedAt: new Date().toISOString(), ...(reviewedSha ? { reviewedSha } : {}) };
      await writeFile(shapePath, `${JSON.stringify(stored, null, 2)}\n`);
      return kept;
    },

    // The stored shape, or one derived from the markdown for a review written before shapes were stored.
    async readShape(markdown = '') {
      try {
        const stored = JSON.parse(await readFile(shapePath, 'utf8'));
        if (stored?.version === 1 && Array.isArray(stored.findings)) return stored;
      } catch {
        /* no stored shape */
      }
      return buildShape({ markdown });
    },

    // The findings of the report a re-run replaces, [] when there is none.
    async previousFindings() {
      return readFile(shapePath, 'utf8').then((t) => JSON.parse(t).findings ?? [], () => []);
    },
  };
}

// The artifact whose markdown is at `outputPath` (reviewOutputPath, mrCommentsOutputPath).
export const artifactOf = (outputPath: string) => artifactAt(dirname(outputPath), basename(outputPath, '.md'));
