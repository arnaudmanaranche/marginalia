// @ts-check
import { readFile, readdir, stat } from 'node:fs/promises';
import { join } from 'node:path';
import { ALLOW_POSTING, JIRA_BASE_URL } from '../config.mjs';
import { PROJECTS, projectByKey } from '../projects.mjs';
import { reviewId } from '../review-id.mjs';
import { TRIAGE_FILE_PREFIX } from '../paths.mjs';
import { posted } from '../posted.mjs';
import { artifactAt } from '../artifact.mjs';
import { listFields } from '../findings.mjs';
import { byPriorityThenDate } from '../jira.mjs';
import { envDefaults, loadSettings } from '../settings.mjs';
import { parseAcrossLayers } from '../stack.mjs';
import { gitlab } from '../gitlab-api.mjs';
import { broadcast, newerState, postQueue, readStatus, stateOverrides } from './context.mjs';

export function kindOf(slug) {
  return slug.startsWith(TRIAGE_FILE_PREFIX) ? 'comments' : 'review';
}

// Forgets posted comments that were deleted on GitLab, so they can be posted
// again and lose their "Posted" badge. Throttled (the client polls every 30 s),
// serialized with posting, and a failed check never drops anything.
let lastReconcile = 0;
async function reconcilePosted() {
  if (Date.now() - lastReconcile < 15_000) return;
  lastReconcile = Date.now();
  await postQueue(async () => {
    let changed = false;
    for (const { key, projectKey, info } of posted.entries()) {
      // A project that left the config is left alone.
      const project = projectByKey(projectKey);
      // With posting off, only the replies on my own MRs (which carry their thread) can exist.
      if (!info.iid || !project || (ALLOW_POSTING !== 'true' && !info.threadId)) continue;
      try {
        if (info.state === 'draft') {
          if (await gitlab.draftNoteExists(project, info.iid, info.draftId)) continue;
          // Gone from the drafts: published from GitLab itself, or deleted there.
          const noteId = info.body ? await gitlab.findPublishedNoteId(project, info.iid, info.body) : null;
          if (noteId) {
            posted.publish(key, `${info.mrUrl}#note_${noteId}`, info.at);
          } else posted.forget(key);
          changed = true;
          continue;
        }
        const noteId = info.url?.match(/#note_(\d+)$/)?.[1];
        if (noteId && !(await gitlab.mergeRequestNoteExists(project, info.iid, noteId))) {
          posted.forget(key);
          changed = true;
        }
      } catch {
        /* GitLab unreachable: keep it for now */
      }
    }
    if (changed) broadcast();
  }).catch(() => {});
}

// Stacks of 2+ MRs from status.json, layers bottom to top. A layer without a
// review file yet has slug null.
function buildStacks(status) {
  const byId = new Map();
  for (const mr of status?.mrs ?? []) {
    if (mr.kind !== 'review' || !mr.stack) continue;
    const id = `${mr.project}/${mr.stack.id}`;
    if (!byId.has(id)) byId.set(id, { id, baseBranch: mr.stack.baseBranch, layers: [] });
    byId.get(id).layers.push({
      iid: mr.iid,
      title: mr.title,
      webUrl: mr.web_url,
      slug: mr.reviewPath ? `${mr.project}/${mr.reviewPath.split('/').pop().replace(/\.md$/, '')}` : null,
      status: mr.status,
      parentIid: mr.stack.parentIid,
      position: mr.stack.position,
    });
  }
  return [...byId.values()].map((st) => ({ ...st, layers: st.layers.sort((a, b) => a.position - b.position) }));
}

// The bot statuses of an MR it is about to review, or failed to, before any report exists.
const AWAITING = new Set(['pending', 'reviewing', 'failed', 'skipped']);

// An MR the poll just picked up has no report yet: it is listed at once, `awaiting` its first one,
// so it arrives in the queue when the bot finds it rather than minutes later.
export function awaitingItem(project, mr) {
  const fileSlug = mr.reviewPath.split('/').pop().replace(/\.md$/, '');
  const at = mr.updatedAt ?? new Date().toISOString();
  return {
    slug: reviewId(project, fileSlug),
    project: project.key,
    kind: mr.kind ?? kindOf(fileSlug),
    title: mr.title ?? fileSlug,
    iid: mr.iid,
    author: mr.author ?? null,
    webUrl: mr.web_url ?? null,
    branch: mr.sourceBranch ?? null,
    verdict: null, risk: null, critical: 0, important: 0, summary: null, highlights: [], postable: 0,
    contract: { source: 'none', warnings: [] },
    stackId: mr.stack?.id ? `${project.key}/${mr.stack.id}` : null,
    crossLayer: [],
    stale: false,
    mtime: at,
    reviewedAt: at,
    tracked: true,
    jira: mr.jira ?? null,
    myState: newerState(mr.myState ?? null, stateOverrides.get(`${project.key}:${mr.iid}`) ?? null),
    // Reviewing shows from the bot's live status; here, whether the first review is still to come.
    awaiting: mr.status === 'failed' ? 'failed' : 'queued',
    failure: mr.status === 'failed' ? mr.failure ?? null : null,
  };
}

async function listProjectReviews(project, status) {
  const mrs = (status?.mrs ?? []).filter((m) => m.project === project.key);
  const byPath = new Map(mrs.map((mr) => [mr.reviewPath, mr]));
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
