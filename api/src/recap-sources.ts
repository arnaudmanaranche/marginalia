// The real reads behind a recap: the review's files, the posted records, GitLab.
import { readFile } from 'node:fs/promises';
import { artifactAt } from './artifact.ts';
import { buildShape } from './findings.ts';
import { dismissedKeys } from './dismissed-store.ts';
import { gitlab } from './gitlab-api.ts';
import { posted } from './posted.ts';
import { reviewFile } from './review-id.ts';
import { postedKey } from './state-shape.ts';
import { getDb } from './store.ts';
import type { RecapSources } from './review-recap.ts';

export function liveSources(project: any, mr: any, slug: string, id: string): RecapSources {
  const artifact = artifactAt(project.reviewsDir, slug);
  const prefix = postedKey(project.key, slug, '');
  return {
    id,
    posted: posted.entries().filter((e) => e.key.startsWith(prefix)).map((e) => ({
      findingId: e.key.slice(prefix.length), at: e.info.at, state: e.info.state, body: e.info.body ?? '', url: e.info.url ?? null,
      // A reply to a thread records the thread it answers; a comment of the review does not.
      reply: e.info.threadId !== undefined,
    })),
    dismissed: [...dismissedKeys(getDb())].filter((k) => k.startsWith(prefix)).map((k) => k.slice(prefix.length)),
    current: async () => {
      const at = await artifact.writtenAt();
      if (at === null) return null;
      // The markdown is the fallback for a review written before findings were stored apart; without it
      // such a review would read as having no findings, and every earlier one would look gone.
      const markdown = await readFile(reviewFile(project, slug), 'utf8').catch(() => '');
      return { shape: await artifact.readShape(markdown), at };
    },
    history: () => artifact.listHistory(),
    historyShape: async (versionId) => {
      const version = await artifact.readHistory(versionId);
      return version && (version.shape ?? buildShape({ markdown: version.markdown }));
    },
    versions: () => gitlab.listMergeRequestVersions(project, mr.iid),
    compare: (from, to) => gitlab.compareRange(project, from, to),
    // `toDiscussions` drops empty threads but types them as possibly null.
    discussions: async () => (await gitlab.listDiscussions(project, mr.iid)).filter((t): t is NonNullable<typeof t> => t !== null),
  };
}
