import { readFile } from 'node:fs/promises';
import { basename, join } from 'node:path';
import { artifactAt } from './artifact.ts';
import { postedOutcome } from './finding-events.ts';
import { listJobs } from './job-list.ts';
import { listProposals } from './approvals.ts';
import { dismissedKeys, dismissedRows } from './dismissed-store.ts';
import { fixedRows } from './fixed-store.ts';
import { lineMetrics } from './line-metrics.ts';

// Gathers what lineMetrics() counts: the jobs of the window, each comment added to a review (as
// proposed or edited, compared with its review's finding) or dismissed, and what still waits.
// A comment whose finding can no longer be read (its review is gone) is posted, but neither as
// proposed nor edited can be shown: it counts apart.
const sent = (info: any) => (info.inline === false ? String(info.body ?? '').replace(/^`[^`]*`\n\n/, '') : String(info.body ?? ''));

/** @param {{ projects: any[], mrs: any[], postedEntries: { key: string, projectKey: string, info: any }[], posted: Record<string, any>, db: any, days?: number }} input */
export async function gatherLineMetrics({ projects, mrs, postedEntries, posted, db, days = 28 }: { projects: any[]; mrs: any[]; postedEntries: any[]; posted: Record<string, any>; db: any; days?: number }) {
  const keys = new Set(projects.map((p: any) => p.key));
  const byKey = new Map(projects.map((p: any) => [p.key, p]));
  // The review line: reviews of other people's MRs and own reviews (a triage of comments is its own job).
  const jobs = (await listJobs([...keys], { limit: 2000 })).filter((j: any) => j.what === 'review' || j.what === 'own');
  const shapes = new Map<string, Promise<any>>();
  const shapeOf = (project: any, slug: string) => {
    const id = `${project.key}/${slug}`;
    if (!shapes.has(id)) shapes.set(id, readFile(join(project.reviewsDir, `${slug}.md`), 'utf8').catch(() => '').then((md) => artifactAt(project.reviewsDir, slug).readShape(md)));
    return shapes.get(id)!;
  };
  const decided = await Promise.all(postedEntries.filter((e: any) => keys.has(e.projectKey)).map(async (e: any) => {
    const rest = e.key.slice(e.projectKey.length + 1);
    const slug = rest.slice(0, rest.lastIndexOf(':'));
    const id = rest.slice(rest.lastIndexOf(':') + 1);
    const finding = (await shapeOf(byKey.get(e.projectKey), basename(slug)).catch(() => null))?.findings?.find((f: any) => f.id === id);
    return { at: String(e.info.at), outcome: finding ? postedOutcome(finding.comment, sent(e.info)) as 'posted' | 'posted_edited' : 'posted_unknown' as const };
  }));
  const dismissed = dismissedRows(db).filter((r) => keys.has(r.key.split('/')[0])).map((r) => ({ at: r.at, outcome: 'dismissed' as const }));
  const fixed = fixedRows(db).filter((r) => keys.has(r.key.split('/')[0])).map((r) => ({ at: r.at, outcome: 'fixed_before_mr' as const }));
  const pending = (await listProposals({ projects, mrs, posted, dismissed: dismissedKeys(db) })).length;
  return lineMetrics({ jobs, decided: [...decided, ...dismissed, ...fixed], pending, days });
}
