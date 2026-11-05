import { artifactAt } from './artifact.ts';
import { fixedBy } from './finding-fixed.ts';
import { gitIn } from './git.ts';
import { isFixed, markFixed } from './fixed-store.ts';
import { logger } from './logger.ts';
import { postedKey } from './state-shape.ts';
import { getDb } from './store.ts';
import { trackFinding } from './telemetry.ts';

// When an own review is made again at a new commit, the findings of the one it replaces whose code
// that push changed are recorded as fixed before the MR (once each), and counted as an event. Run
// before the new report is stored: it reads the previous one. Never fails the review.
/** @param {{ project: any, slug: string, newSha: string, iid: number | null }} input @returns the ids of the findings fixed by this push */
export async function recordFixedBefore({ project, slug, newSha, iid }: { project: any; slug: string; newSha: string; iid: number | string | null }): Promise<string[]> {
  const fixed: string[] = [];
  try {
    const previous = await artifactAt(project.reviewsDir, slug).readShape();
    const before = previous.reviewedSha;
    if (!before || before === newSha) return fixed;
    const db = getDb();
    for (const finding of previous.findings ?? []) {
      const key = postedKey(project.key, slug, finding.id);
      if (!finding.path || isFixed(db, key)) continue;
      // Commits the checkout no longer has say nothing about the code.
      const diff = await gitIn(project.worktreeDir).run('diff', '-U0', '--no-renames', before, newSha, '--', finding.path).catch(() => null);
      if (diff === null || !fixedBy(finding, diff) || !markFixed(db, key, newSha)) continue;
      fixed.push(finding.id);
      trackFinding({ project: project.key, iid, scope: slug, findingId: finding.id, severity: finding.severity ?? null, outcome: 'fixed_before_mr', own: true, criticalPaths: (previous.criticalPaths ?? []).length });
    }
  } catch (err) {
    logger.debug({ err }, 'Could not tell which findings a push fixed');
  }
  return fixed;
}
