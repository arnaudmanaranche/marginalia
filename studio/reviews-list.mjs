// @ts-check
import { readFile, readdir, stat } from 'node:fs/promises';
import { join } from 'node:path';
import { ALLOW_POSTING, ALLOW_PUSH, JIRA_BASE_URL } from '../lib/config.mjs';
import { PROJECTS, projectByKey } from '../lib/projects.mjs';
import { reviewId } from '../lib/review-id.mjs';
import { TRIAGE_FILE_PREFIX } from '../lib/paths.mjs';
import { loadPosted, savePosted } from '../lib/posted.mjs';
import { loadShape, listFields } from '../lib/findings.mjs';
import { byPriorityThenDate } from '../lib/jira.mjs';
import { envDefaults, loadSettings } from '../lib/settings.mjs';
import { parseAcrossLayers } from '../lib/stack.mjs';
import { findPublishedNoteId, mergeRequestNoteExists } from '../lib/gitlab.mjs';
import { draftNoteExists } from '../lib/gitlab-drafts.mjs';
import { broadcast, newerState, postQueue, readStatus, stateOverrides } from './context.mjs';

export function kindOf(slug) {
  return slug.startsWith(TRIAGE_FILE_PREFIX) ? 'comments' : 'review';
}

// Forgets posted comments that were deleted on GitLab, so they can be posted
// again and lose their "Posted" badge. Throttled (the client polls every 30 s),
// serialized with posting, and a failed check never drops anything.
let lastReconcile = 0;
async function reconcilePosted() {
  if (ALLOW_POSTING !== 'true' || Date.now() - lastReconcile < 15_000) return;
  lastReconcile = Date.now();
  await postQueue(async () => {
    const posted = await loadPosted();
    let changed = false;
    for (const [key, info] of Object.entries(posted)) {
      // Keys are `<project>/<slug>:<comment>`; a project that left the config is left alone.
      const project = projectByKey(key.split('/')[0]);
      if (!info.iid || !project) continue;
      try {
        if (info.state === 'draft') {
          if (await draftNoteExists(project, info.iid, info.draftId)) continue;
          // Gone from the drafts: published from GitLab itself, or deleted there.
          const noteId = info.body ? await findPublishedNoteId(project, info.iid, info.body) : null;
          if (noteId) {
            posted[key] = { ...info, state: 'published', url: `${info.mrUrl}#note_${noteId}` };
            delete posted[key].draftId;
          } else delete posted[key];
          changed = true;
          continue;
        }
        const noteId = info.url?.match(/#note_(\d+)$/)?.[1];
        if (noteId && !(await mergeRequestNoteExists(project, info.iid, noteId))) {
          delete posted[key];
          changed = true;
        }
      } catch {
        /* GitLab unreachable: keep it for now */
      }
    }
    if (changed) {
      await savePosted(posted);
      broadcast();
    }
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

async function listProjectReviews(project, status) {
  const byPath = new Map((status?.mrs ?? []).filter((m) => m.project === project.key).map((mr) => [mr.reviewPath, mr]));
  let names = [];
  try {
    names = (await readdir(project.reviewsDir)).filter((n) => n.endsWith('.md'));
  } catch {
    /* reviews dir not created yet */
  }
  return Promise.all(names.map(async (name) => {
    const fileSlug = name.slice(0, -3);
    const path = join(project.reviewsDir, name);
    const [md, st] = await Promise.all([readFile(path, 'utf8'), stat(path)]);
    const shape = await loadShape(project.reviewsDir, fileSlug, md);
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
      jira: mr?.jira ?? null,
      myState: newerState(mr?.myState ?? null, mr ? stateOverrides.get(`${project.key}:${mr.iid}`) ?? null : null),
    };
  }));
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
    allowPosting: ALLOW_POSTING === 'true', allowPush: ALLOW_PUSH === 'true',
    posted: await loadPosted(),
  };
}
