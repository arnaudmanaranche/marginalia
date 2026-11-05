import { readFile } from 'node:fs/promises';
import { join } from 'node:path';
import { artifactAt } from './artifact.ts';
import { postedOutcome } from './finding-events.ts';
import { trackFinding } from './telemetry.ts';
import { kindOf } from './http/review-kind.ts';

// After a comment reached GitLab from the studio: was it the finding's comment as proposed, or
// edited first? Read from the stored review; never fails the post that triggered it.
/** @param {{ project: any, slug: string, iid: number, commentId: string, body: string }} input */
export async function recordPosted({ project, slug, iid, commentId, body }: { project: any; slug: string; iid: number; commentId: string; body: string }) {
  try {
    const markdown = await readFile(join(project.reviewsDir, `${slug}.md`), 'utf8').catch(() => '');
    const shape = await artifactAt(project.reviewsDir, slug).readShape(markdown);
    const finding = shape.findings.find((f: any) => f.id === commentId);
    if (!finding) return;
    trackFinding({
      project: project.key, iid, findingId: finding.id, severity: finding.severity ?? null,
      outcome: postedOutcome(finding.comment, body), own: kindOf(slug) === 'own', criticalPaths: (shape.criticalPaths ?? []).length,
    });
  } catch {
    /* telemetry never hurts a post */
  }
}
