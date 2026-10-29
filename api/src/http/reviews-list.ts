import { readFile, readdir, stat } from 'node:fs/promises';
import { join } from 'node:path';
import { ALLOW_POSTING, JIRA_BASE_URL } from '../config.ts';
import { PROJECTS } from '../projects.ts';
import { reviewId } from '../review-id.ts';
import { posted } from '../posted.ts';
import { artifactAt } from '../artifact.ts';
import { listFields } from '../findings.ts';
import { byPriorityThenDate } from '../jira.ts';
import { envDefaults, loadSettings } from '../settings.ts';
import { parseAcrossLayers } from '../stack.ts';
import { newerState, readStatus, stateOverrides } from './context.ts';
import { kindOf } from './review-kind.ts';
import { reconcilePosted } from './reviews-reconcile.ts';
import { buildStacks } from './reviews-stacks.ts';
import { AWAITING, awaitingItem } from './reviews-awaiting.ts';

async function listProjectReviews(project, status) {
  type Mr = Record<string, any>;
  const mrs = ((status?.mrs ?? []) as Mr[]).filter((m) => m.project === project.key);
  const byPath = new Map<string, Mr>(mrs.map((mr): [string, Mr] => [mr.reviewPath, mr]));
  let names = [];
  try {
    names = (await readdir(project.reviewsDir)).filter((n) => n.endsWith('.md'));
  } catch {
    /* reviews dir not created yet */
  }
  const written = new Set(names.map((n) => join(project.reviewsDir, n)));
  const awaiting = mrs.filter((mr) => mr.reviewPath && !written.has(mr.reviewPath) && AWAITING.has(mr.status)).map((mr) => awaitingItem(project, mr));
  return [...awaiting, ...(await Promise.all(names.map(async (name) => {
    const fileSlug = name.slice(0, -3);
    const path = join(project.reviewsDir, name);
    const [md, st] = await Promise.all([readFile(path, 'utf8'), stat(path)]);
    const shape = await artifactAt(project.reviewsDir, fileSlug).readShape(md);
    const mr = byPath.get(path);
    const title = md.match(/^#\s+(.+)$/m)?.[1] ?? null;
    return {
      slug: reviewId(project, fileSlug),
      project: project.key,
      kind: kindOf(fileSlug),
      title: mr?.title ?? title ?? fileSlug,
      iid: mr?.iid ?? md.match(/\bMR:?\s*!(\d+)/i)?.[1] ?? md.match(/\bMR !(\d+)/)?.[1] ?? null,
      author: mr?.author ?? null,
      webUrl: mr?.web_url ?? null,
      branch: md.match(/\*\*Branch:\*\*\s*([^\s|]+)/)?.[1] ?? null,
      ...listFields(shape),
      stackId: mr?.stack?.id ? `${project.key}/${mr.stack.id}` : null,
      crossLayer: parseAcrossLayers(md),
      // Reviewed before, but the commit (or the layer below) moved since.
      stale: mr?.status === 'pending' && Boolean(mr?.reviewedAt),
      mtime: st.mtime.toISOString(),
      reviewedAt: mr?.reviewedAt ?? st.mtime.toISOString(),
      tracked: Boolean(mr),
      // A re-run that failed: the report on screen is the one before it.
      failure: mr?.status === 'failed' ? mr.failure ?? null : null,
      jira: mr?.jira ?? null,
      myState: newerState(mr?.myState ?? null, mr ? stateOverrides.get(`${project.key}:${mr.iid}`) ?? null : null),
    };
  })))];
}

export async function listReviews() {
  // Checked against GitLab in the background (a round trip per posted comment): the list must not wait
  // for it. When it changes something, the page is told and loads the list again.
  void reconcilePosted();
  const status = await readStatus();
  const items = (await Promise.all(PROJECTS.map((project) => listProjectReviews(project, status)))).flat();
  items.sort(byPriorityThenDate);
  // https://host/group/project of each project, from any tracked MR url; used to link !123 and file paths.
  const projectUrls = {};
  for (const mr of status?.mrs ?? []) projectUrls[mr.project] ??= mr.web_url?.match(/^(.*)\/-\/merge_requests\/\d+/)?.[1];
  const projectUrl = Object.values(projectUrls).find(Boolean) ?? null;
  const projects = PROJECTS.map((p) => ({ key: p.key, kind: p.kind, gitlabProjectId: p.gitlabProjectId, url: projectUrls[p.key] ?? null }));
  return {
    status, items, stacks: buildStacks(status), projectUrl, projects,
    jiraBaseUrl: JIRA_BASE_URL ? JIRA_BASE_URL.replace(/\/+$/, '') : null,
    settings: loadSettings(), settingsDefaults: envDefaults(),
    allowPosting: ALLOW_POSTING === 'true',
    posted: posted.all(),
  };
}

