import { basename } from 'node:path';
import { readFile } from 'node:fs/promises';
import { artifactAt } from './artifact.ts';
import { postedKey } from './state-shape.ts';
import { kindOf } from './http/review-kind.ts';

// The approvals inbox (ADR 0006): every comment the factory proposes on someone else's MR and no
// person has decided on yet (neither posted nor dismissed), newest review first. An own review
// proposes nothing to post; a triage's replies have their own board.
/** @param {{ projects: any[], mrs: any[], posted: Record<string, any>, dismissed: Set<string> }} input */
export async function listProposals({ projects, mrs, posted, dismissed }: { projects: any[]; mrs: any[]; posted: Record<string, any>; dismissed: Set<string> }) {
  const byKey = new Map(projects.map((p: any) => [p.key, p]));
  const tracked = mrs.filter((m: any) => m.reviewPath && byKey.has(m.project) && kindOf(basename(m.reviewPath, '.md')) === 'review');
  const groups = await Promise.all(tracked.map(async (mr: any) => {
    const project = byKey.get(mr.project);
    const slug = basename(mr.reviewPath, '.md');
    const markdown = await readFile(mr.reviewPath, 'utf8').catch(() => null);
    if (markdown === null) return [];
    const shape = await artifactAt(project.reviewsDir, slug).readShape(markdown);
    const reviewedAt = shape.generatedAt ?? mr.reviewedAt ?? null;
    return shape.findings
      .filter((f: any) => f.comment && !posted[postedKey(project.key, slug, f.id)] && !dismissed.has(postedKey(project.key, slug, f.id)))
      .map((f: any) => ({
        slug: `${project.key}/${slug}`, project: project.key, iid: mr.iid, mrTitle: mr.title ?? slug, webUrl: mr.web_url ?? null, reviewedAt,
        findingId: f.id, severity: f.severity, title: f.title, body: f.body ?? '', path: f.path ?? null, line: f.line ?? null, comment: f.comment,
        criticalPaths: shape.criticalPaths ?? [],
      }));
  }));
  return groups.flat().sort((a: any, b: any) => String(b.reviewedAt ?? '').localeCompare(String(a.reviewedAt ?? '')));
}
