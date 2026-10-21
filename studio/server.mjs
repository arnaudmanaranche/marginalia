// Local review reader: JSON API over each project's reviews dir + status.json, live updates
// over SSE, and the built React app (studio/dist) as static files. Bound to
// 127.0.0.1 only; read-only apart from PUT /api/settings (the Settings page) and,
// when ALLOW_POSTING=true, POST /api/post (comment on the MR, after confirmation),
// POST /api/rerun (queue a fresh review of one MR) and, when ALLOW_PUSH=true,
// POST /api/push (push a triage's local fixes to the MR branch).
import { createServer } from 'node:http';
import { readFile, readdir, stat } from 'node:fs/promises';
import { watch } from 'node:fs';
import { join, dirname, extname, normalize } from 'node:path';
import { fileURLToPath } from 'node:url';
import { STATUS_FILE, STUDIO_PORT, ALLOW_POSTING, ALLOW_PUSH, JIRA_BASE_URL, GITLAB_BASE_URL, GITLAB_TOKEN } from '../lib/config.mjs';
import { PROJECTS, projectByKey } from '../lib/projects.mjs';
import { parseReviewId, projectOfUpload, reviewId } from '../lib/review-id.mjs';
import { uploadFetchPath } from '../lib/gitlab-upload.mjs';
import { fixesStatus, pushFixes } from '../lib/fixes.mjs';
import { TRIAGE_FILE_PREFIX } from '../lib/paths.mjs';
import { loadPosted, savePosted } from '../lib/posted.mjs';
import { listHistory, readHistory } from '../lib/history.mjs';
import { buildShape, listFields, loadShape } from '../lib/findings.mjs';
import { askAboutStop } from '../lib/chat.mjs';
import { buildChatPrompt, parseChatInput } from '../lib/chat-prompt.mjs';
import { fetchReviewState } from '../lib/mr-state.mjs';
import { filesForPatterns, toDiffFile } from '../lib/mr-diff.mjs';
import { reviewDiff } from '../lib/review-diff.mjs';
import { reviewThreads } from '../lib/review-threads.mjs';
import { listMergeRequestDiffs, findPublishedNoteId, mergeRequestNoteExists, approveMergeRequest } from '../lib/gitlab.mjs';
import { parseReviewAction, reviewerStateFor } from '../lib/review-actions.mjs';
import { createDraftNote, createInlineDraftNote, listDraftNotes, updateDraftNote, deleteDraftNote, publishDraftNotes, draftNoteExists } from '../lib/gitlab-drafts.mjs';
import { byPriorityThenDate } from '../lib/jira.mjs';
import { envDefaults, loadSettings, saveSettings } from '../lib/settings.mjs';
import { loadState, saveState } from '../lib/state.mjs';
import { parseAcrossLayers } from '../lib/stack.mjs';

const DIST = join(dirname(fileURLToPath(import.meta.url)), 'dist');
const MIME = {
  '.html': 'text/html; charset=utf-8',
  '.js': 'text/javascript; charset=utf-8',
  '.css': 'text/css; charset=utf-8',
  '.svg': 'image/svg+xml',
  '.json': 'application/json; charset=utf-8',
  '.yaml': 'application/yaml; charset=utf-8',
  '.woff2': 'font/woff2',
  '.ico': 'image/x-icon',
};

async function readStatus() {
  try {
    return JSON.parse(await readFile(STATUS_FILE, 'utf8'));
  } catch {
    return null;
  }
}

function kindOf(slug) {
  if (slug.startsWith(TRIAGE_FILE_PREFIX)) return 'comments';
  return 'review';
}

// Forgets posted comments that were deleted on GitLab, so they can be posted
// again and lose their "Posted" badge. Throttled (the client polls every 30 s),
// serialized with posting, and a failed check never drops anything.
let lastReconcile = 0;
async function reconcilePosted() {
  if (ALLOW_POSTING !== 'true' || Date.now() - lastReconcile < 15_000) return;
  lastReconcile = Date.now();
  const run = postQueue.then(async () => {
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
  });
  postQueue = run.catch(() => {});
  await run.catch(() => {});
}

// Resolves a review id (`<project>/<slug>`): { project, slug, mr }, where mr is the MR
// tracked in status.json for it (undefined when none), or null for an id that is not valid.
async function locate(id) {
  const parsed = parseReviewId(id, PROJECTS);
  if (!parsed) return null;
  const status = await readStatus();
  const mr = (status?.mrs ?? []).find((m) => m.project === parsed.project.key && m.reviewPath === join(parsed.project.reviewsDir, `${parsed.slug}.md`));
  return { ...parsed, mr, status };
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

// Where an MR stands for me is read from GitLab by the poll. After an action here (a comment, a
// submitted review, a deleted draft) that one MR is read again at once, so Home moves it without
// waiting for the next poll. The newer of the two readings is the one shown.
const stateOverrides = new Map();
const newerState = (a, b) => (a && b ? (Date.parse(a.computedAt) >= Date.parse(b.computedAt) ? a : b) : a ?? b ?? null);
function refreshState(project, mr) {
  fetchReviewState(project, mr)
    .then((state) => {
      stateOverrides.set(`${project.key}:${mr.iid}`, state);
      broadcast();
    })
    .catch((err) => console.warn(`[studio] could not refresh where !${mr.iid} stands: ${String(err.message).slice(0, 120)}`));
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

async function listReviews() {
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
  return { status, items, stacks: buildStacks(status), projectUrl, projects, jiraBaseUrl: JIRA_BASE_URL ? JIRA_BASE_URL.replace(/\/+$/, '') : null, settings: loadSettings(), settingsDefaults: envDefaults(), allowPosting: ALLOW_POSTING === 'true', allowPush: ALLOW_PUSH === 'true', posted: await loadPosted() };
}

const clients = new Set();
let debounce = null;
function broadcast() {
  clearTimeout(debounce);
  debounce = setTimeout(() => {
    for (const res of clients) res.write('data: changed\n\n');
  }, 150);
}

function json(res, code, body) {
  res.writeHead(code, { 'content-type': 'application/json; charset=utf-8', 'cache-control': 'no-store' });
  res.end(JSON.stringify(body));
}

async function serveStatic(pathname, res) {
  const rel = normalize(pathname === '/' ? '/index.html' : pathname);
  const file = join(DIST, rel);
  if (!file.startsWith(DIST)) return json(res, 400, { error: 'bad path' });
  try {
    const body = await readFile(file);
    res.writeHead(200, { 'content-type': MIME[extname(file)] ?? 'application/octet-stream' });
    res.end(body);
  } catch {
    // SPA fallback; if the app isn't built yet, say so.
    try {
      const body = await readFile(join(DIST, 'index.html'));
      res.writeHead(200, { 'content-type': MIME['.html'] });
      res.end(body);
    } catch {
      res.writeHead(503, { 'content-type': 'text/plain; charset=utf-8' });
      res.end('Studio not built: run `npm run studio:build`.');
    }
  }
}

// Write endpoints (PUT /api/settings, POST /api/post). Guarded against other
// web pages hitting localhost: Host must be us (DNS rebinding), Origin must be
// us when present, and the body must be JSON (a cross-origin JSON request needs
// a CORS preflight we don't answer).
const OWN_HOSTS = new Set([`localhost:${STUDIO_PORT}`, `127.0.0.1:${STUDIO_PORT}`]);
function isOwnOrigin(req) {
  const origin = req.headers.origin;
  return OWN_HOSTS.has(req.headers.host ?? '') && !(origin && !OWN_HOSTS.has(origin.replace(/^https?:\/\//, '')));
}
async function readJsonBody(req, res) {
  if (!isOwnOrigin(req)) {
    json(res, 403, { error: 'forbidden' });
    return null;
  }
  if (!String(req.headers['content-type'] ?? '').startsWith('application/json')) {
    json(res, 415, { error: 'expected application/json' });
    return null;
  }
  let raw = '';
  for await (const chunk of req) {
    raw += chunk;
    if (raw.length > 20_000) {
      json(res, 413, { error: 'too large' });
      return null;
    }
  }
  try {
    return JSON.parse(raw);
  } catch {
    json(res, 400, { error: 'invalid JSON' });
    return null;
  }
}

async function putSettings(req, res) {
  const body = await readJsonBody(req, res);
  if (body === null) return undefined;
  try {
    return json(res, 200, { settings: await saveSettings(body), defaults: envDefaults() });
  } catch (err) {
    return json(res, 400, { error: String(err.message) });
  }
}

// Serialized so two quick clicks can't both pass the "already posted" check.
let postQueue = Promise.resolve();

// Posts { slug, commentId, body, path?, line? } on the MR tracked for that
// review: inline on path:line when given, else (or if GitLab refuses the
// anchor) as a general comment. The MR is resolved server-side from status.json, never taken
// from the request, so the client can't aim it at another MR.
async function postComment(req, res) {
  if (ALLOW_POSTING !== 'true') return json(res, 403, { error: 'posting is disabled (ALLOW_POSTING=false)' });
  const input = await readJsonBody(req, res);
  if (input === null) return undefined;
  const { slug, commentId, body, path, line } = input;
  if (!parseReviewId(slug, PROJECTS) || typeof commentId !== 'string' || !/^[\w-]{1,64}$/.test(commentId)) {
    return json(res, 400, { error: 'bad slug or commentId' });
  }
  if (typeof body !== 'string' || !body.trim() || body.length > 10_000) {
    return json(res, 400, { error: 'body must be a non-empty string under 10000 characters' });
  }
  const hasTarget = path !== undefined || line !== undefined;
  if (hasTarget && (typeof path !== 'string' || !path || path.length > 500 || path.includes('\0') || (line !== undefined && (!Number.isInteger(line) || line < 1)))) {
    return json(res, 400, { error: 'bad path or line' });
  }
  const run = postQueue.then(async () => {
    const { project, mr } = await locate(slug);
    if (!mr) return json(res, 404, { error: 'no tracked merge request for this review' });
    const posted = await loadPosted();
    const key = postedKey(project.key, parseReviewId(slug, PROJECTS).slug, commentId);
    if (posted[key]) return json(res, 409, { error: 'already posted', posted: posted[key] });
    let draft;
    let text = body.trim();
    let inline = false;
    try {
      if (hasTarget) {
        try {
          draft = await createInlineDraftNote(project, mr.iid, text, path, line);
          inline = true;
        } catch (err) {
          // Typically a line outside the diff (400): keep the comment, drop the anchor.
          console.warn(`[studio] inline draft on ${path}${line ? `:${line}` : ''} failed, adding a general note: ${String(err.message).slice(0, 200)}`);
        }
      }
      if (!inline) {
        if (hasTarget) text = `\`${path}${line ? `:${line}` : ''}\`\n\n${text}`;
        draft = await createDraftNote(project, mr.iid, text);
      }
    } catch (err) {
      return json(res, 502, { error: String(err.message).slice(0, 300) });
    }
    posted[key] = { at: new Date().toISOString(), iid: mr.iid, state: 'draft', draftId: draft.id, body: text, mrUrl: mr.web_url, url: mr.web_url, inline: hasTarget ? inline : undefined };
    await savePosted(posted);
    refreshState(project, mr);
    broadcast();
    return json(res, 200, posted[key]);
  });
  postQueue = run.catch(() => {});
  return run;
}

// Replies { slug, discussionId, body } to a thread of the tracked MR, as a draft
// of the pending review. The discussion must belong to that MR: GitLab rejects
// an id from another one, and the MR itself comes from status.json.
// Submits the drafts of one review as a real GitLab review, with an optional
// summary note and an `action` (comment, approve, request_changes). Like
// postComment(), the MR comes from status.json.
async function submitReview(req, res) {
  if (ALLOW_POSTING !== 'true') return json(res, 403, { error: 'posting is disabled (ALLOW_POSTING=false)' });
  const input = await readJsonBody(req, res);
  if (input === null) return undefined;
  const { slug, summary } = input;
  const action = parseReviewAction(input.action);
  if (!parseReviewId(slug, PROJECTS)) return json(res, 400, { error: 'bad slug' });
  if (!action) return json(res, 400, { error: 'action must be comment, approve or request_changes' });
  if (summary !== undefined && (typeof summary !== 'string' || summary.length > 10_000)) return json(res, 400, { error: 'summary must be a string under 10000 characters' });
  const run = postQueue.then(async () => {
    const { project, mr } = await locate(slug);
    if (!mr) return json(res, 404, { error: 'no tracked merge request for this review' });
    const posted = await loadPosted();
    const drafts = Object.entries(posted).filter(([key, info]) => key.startsWith(`${slug}:`) && info.state === 'draft');
    const text = summary?.trim();
    // Approving or requesting changes needs no comment: the verdict is the review.
    if (!drafts.length && !text && action === 'comment') return json(res, 400, { error: 'nothing to submit' });
    try {
      if (text) await createDraftNote(project, mr.iid, text);
      // Drafts started in GitLab itself are not in posted.json: ask GitLab.
      const pending = drafts.length > 0 || Boolean(text) || (await listDraftNotes(project, mr.iid)).length > 0;
      if (pending || action === 'request_changes') await publishDraftNotes(project, mr.iid, reviewerStateFor(action));
    } catch (err) {
      return json(res, 502, { error: String(err.message).slice(0, 300) });
    }
    let approveError = null;
    if (action === 'approve') {
      try {
        await approveMergeRequest(project, mr.iid, (await loadState(project))[mr.iid]);
      } catch (err) {
        approveError = String(err.message).slice(0, 300);
      }
    }
    for (const [key, info] of drafts) {
      let noteId = null;
      try {
        noteId = await findPublishedNoteId(project, info.iid, info.body);
      } catch {
        /* the review is out; only the deep link is missing */
      }
      const { draftId, ...rest } = info;
      posted[key] = { ...rest, state: 'published', at: new Date().toISOString(), url: noteId ? `${info.mrUrl}#note_${noteId}` : info.mrUrl };
    }
    await savePosted(posted);
    refreshState(project, mr);
    broadcast();
    // The comments are out either way: say so, so the user does not submit them twice.
    if (approveError) return json(res, 502, { error: `Comments published, but the approval failed: ${approveError}` });
    return json(res, 200, { submitted: drafts.length, summary: Boolean(text), action });
  });
  postQueue = run.catch(() => {});
  return run;
}

// Edits (PUT, { body }) or deletes (DELETE) one pending draft of a tracked review,
// including drafts started in GitLab itself. The draft is addressed under the MR
// resolved from status.json, so it can't reach another MR's drafts.
async function mutateDraft(req, res, pathname) {
  if (ALLOW_POSTING !== 'true') return json(res, 403, { error: 'posting is disabled (ALLOW_POSTING=false)' });
  if (!isOwnOrigin(req)) return json(res, 403, { error: 'forbidden' });
  const [, slugPart, idPart] = pathname.match(/^\/api\/drafts\/([^/]+)\/(\d{1,12})$/) ?? [];
  let slug;
  try {
    slug = decodeURIComponent(slugPart ?? '');
  } catch {
    slug = '';
  }
  if (!parseReviewId(slug, PROJECTS) || !idPart) return json(res, 400, { error: 'bad slug or draft id' });
  const draftId = Number(idPart);
  let text;
  if (req.method === 'PUT') {
    const input = await readJsonBody(req, res);
    if (input === null) return undefined;
    text = typeof input.body === 'string' ? input.body.trim() : '';
    if (!text || text.length > 10_000) return json(res, 400, { error: 'body must be a non-empty string under 10000 characters' });
  }
  const run = postQueue.then(async () => {
    const { project, mr } = await locate(slug);
    if (!mr) return json(res, 404, { error: 'no tracked merge request for this review' });
    try {
      if (req.method === 'PUT') await updateDraftNote(project, mr.iid, draftId, text);
      else await deleteDraftNote(project, mr.iid, draftId);
    } catch (err) {
      return json(res, / -> 404:/.test(String(err.message)) ? 404 : 502, { error: String(err.message).slice(0, 300) });
    }
    // Keep the local record in step: a deleted draft can be added again, an edited one keeps its new text for matching.
    const posted = await loadPosted();
    const entry = Object.entries(posted).find(([key, info]) => key.startsWith(`${project.key}/`) && info.state === 'draft' && info.draftId === draftId && info.iid === mr.iid);
    if (entry) {
      if (req.method === 'DELETE') delete posted[entry[0]];
      else posted[entry[0]] = { ...entry[1], body: text };
      await savePosted(posted);
    }
    refreshState(project, mr);
    broadcast();
    return json(res, 200, { ok: true });
  });
  postQueue = run.catch(() => {});
  return run;
}

// One chat question at a time: each is a Claude run with a cost.
let chatBusy = false;
async function chatAboutStop(req, res) {
  const input = await readJsonBody(req, res);
  if (input === null) return undefined;
  const parsed = parseChatInput(input);
  if (parsed.error) return json(res, 400, { error: parsed.error });
  const { slug, stopId, question, history } = parsed;
  const found = await locate(slug);
  if (!found) return json(res, 400, { error: 'bad slug' });
  const { project, mr } = found;
  if (!mr) return json(res, 404, { error: 'no tracked merge request for this review' });
  const shape = await loadShape(project.reviewsDir, found.slug, '');
  const stop = (shape.tour ?? []).find((s) => s.id === stopId);
  if (!stop) return json(res, 404, { error: 'no such stop in this review' });
  if (chatBusy) return json(res, 429, { error: 'another question is being answered, try again in a moment' });
  chatBusy = true;
  try {
    const files = filesForPatterns((await listMergeRequestDiffs(project, mr.iid)).map(toDiffFile), stop.files);
    const prompt = buildChatPrompt({ title: mr.title, shape, stop, files, history, question });
    return json(res, 200, { answer: await askAboutStop({ project, iid: mr.iid, prompt }) });
  } catch (err) {
    return json(res, 502, { error: String(err.message).slice(0, 300) });
  } finally {
    chatBusy = false;
  }
}

// Re-runs the review (or the comment triage, for my own MRs) of one tracked MR. The
// poller skips an MR whose recorded SHA matches its head, so the entry is set to
// null (not deleted: an absent entry would let it trust an existing review file)
// and the poller is nudged with SIGUSR1, the same signal as the menu bar's "Poll now".
// state.json is only edited while the poller is idle: a running poll holds its own
// copy of the state in memory and would overwrite the change when it saves.
async function rerunReview(req, res) {
  const input = await readJsonBody(req, res);
  if (input === null) return undefined;
  const { slug } = input;
  const found = await locate(slug);
  if (!found) return json(res, 400, { error: 'bad slug' });
  const { project, mr, status } = found;
  if (!mr) return json(res, 404, { error: 'no tracked merge request for this review' });
  let alive = false;
  try {
    alive = Boolean(status?.pid) && process.kill(status.pid, 0);
  } catch {
    /* no such process */
  }
  if (!alive || status.phase === 'stopped') return json(res, 409, { error: 'the bot is not running: start it with npm start' });
  if (status.phase !== 'idle' && status.phase !== 'error') return json(res, 409, { error: 'a run is in progress, try again when it is done' });
  const state = await loadState(project);
  if (mr.kind === 'comments') state.mineComments[mr.iid] = null;
  else state[mr.iid] = null;
  await saveState(project, state);
  process.kill(status.pid, 'SIGUSR1');
  return json(res, 200, { ok: true, iid: mr.iid, kind: mr.kind });
}

// The tracked MR of a triage, as fixesStatus() wants it, or null.
async function triagedMr(slug) {
  const found = await locate(slug);
  const mr = found?.mr;
  return mr?.kind === 'comments' && mr.sourceBranch ? { project: found.project, mr: { iid: mr.iid, source_branch: mr.sourceBranch } } : null;
}

// Pushes the local fixes of one triage to its MR branch, only if that branch hasn't
// moved since (fast-forward). Serialized so two clicks can't race on the same push.
let pushQueue = Promise.resolve();
async function pushTriageFixes(req, res) {
  if (ALLOW_PUSH !== 'true') return json(res, 403, { error: 'pushing is disabled (ALLOW_PUSH=false)' });
  const input = await readJsonBody(req, res);
  if (input === null) return undefined;
  const { slug } = input;
  if (!parseReviewId(slug, PROJECTS)) return json(res, 400, { error: 'bad slug' });
  const run = pushQueue.then(async () => {
    const triaged = await triagedMr(slug);
    if (!triaged) return json(res, 404, { error: 'no tracked triage for this slug' });
    try {
      const { pushed, status } = await pushFixes(triaged.project, triaged.mr);
      if (!pushed) return json(res, 409, { error: status.state === 'outdated' ? 'the MR branch moved since the triage: re-run it' : `nothing to push (${status.state})`, status });
      return json(res, 200, status);
    } catch (err) {
      return json(res, 502, { error: String(err.stderr || err.message).trim().slice(0, 300) });
    }
  });
  pushQueue = run.catch(() => {});
  return run;
}

// An image a GitLab note embeds, fetched with the token (the browser has no GitLab login).
async function serveGitlabImage(res, src) {
  let project = null;
  try {
    project = projectOfUpload(new URL(src, GITLAB_BASE_URL).pathname, PROJECTS);
  } catch { /* not a URL: uploadFetchPath refuses it below */ }
  const path = project && uploadFetchPath(src, GITLAB_BASE_URL, project.encodedId);
  if (!path) return json(res, 400, { error: 'not a GitLab upload' });
  try {
    const upstream = await fetch(`${GITLAB_BASE_URL}${path}`, { headers: { 'PRIVATE-TOKEN': GITLAB_TOKEN }, redirect: 'follow' });
    const type = upstream.headers.get('content-type') ?? '';
    if (!upstream.ok || !/^image\/(png|jpe?g|gif|webp|avif|bmp)/i.test(type)) return json(res, 404, { error: 'image unavailable' });
    res.writeHead(200, { 'content-type': type, 'cache-control': 'private, max-age=3600', 'x-content-type-options': 'nosniff' });
    res.end(Buffer.from(await upstream.arrayBuffer()));
  } catch {
    return json(res, 502, { error: 'image unavailable' });
  }
}

async function handle(req, res) {
  const { pathname, searchParams } = new URL(req.url, 'http://localhost');
  if (req.method === 'PUT' && pathname === '/api/settings') return putSettings(req, res);
  if (req.method === 'POST' && pathname === '/api/post') return postComment(req, res);
  if (req.method === 'POST' && pathname === '/api/submit-review') return submitReview(req, res);
  if (req.method === 'POST' && pathname === '/api/chat') return chatAboutStop(req, res);
  if (req.method === 'POST' && pathname === '/api/rerun') return rerunReview(req, res);
  if (req.method === 'POST' && pathname === '/api/push') return pushTriageFixes(req, res);
  if ((req.method === 'PUT' || req.method === 'DELETE') && pathname.startsWith('/api/drafts/')) return mutateDraft(req, res, pathname);
  if (req.method !== 'GET') return json(res, 405, { error: 'read-only' });

  if (pathname === '/api/gitlab-image') return serveGitlabImage(res, searchParams.get('src') ?? '');
  if (pathname === '/api/reviews') return json(res, 200, await listReviews());

  // Previous versions of a review (/api/history/:slug) and one of them (/api/history/:slug/:id).
  if (pathname.startsWith('/api/history/')) {
    const [slugPart, idPart] = pathname.slice('/api/history/'.length).split('/');
    let slug;
    try {
      slug = decodeURIComponent(slugPart ?? '');
    } catch {
      slug = '';
    }
    const where = parseReviewId(slug, PROJECTS);
    if (!where) return json(res, 400, { error: 'bad slug' });
    if (!idPart) return json(res, 200, { versions: await listHistory(where.project.reviewsDir, where.slug) });
    const version = await readHistory(where.project.reviewsDir, where.slug, idPart);
    if (version === null) return json(res, 404, { error: 'not found' });
    return json(res, 200, { slug, id: idPart, markdown: version.markdown, shape: version.shape ?? buildShape({ markdown: version.markdown }) });
  }

  // The MR's GitLab conversation, for the studio's discussion panel.
  if (pathname.startsWith('/api/drafts/')) {
    if (ALLOW_POSTING !== 'true') return json(res, 403, { error: 'posting is disabled (ALLOW_POSTING=false)' });
    let slug;
    try {
      slug = decodeURIComponent(pathname.slice('/api/drafts/'.length));
    } catch {
      return json(res, 400, { error: 'bad slug' });
    }
    const found = await locate(slug);
    if (!found) return json(res, 400, { error: 'bad slug' });
    if (!found.mr) return json(res, 404, { error: 'no tracked merge request for this review' });
    try {
      return json(res, 200, { drafts: await listDraftNotes(found.project, found.mr.iid) });
    } catch (err) {
      return json(res, 502, { error: String(err.message).slice(0, 300) });
    }
  }

  const threadsMatch = /^\/api\/reviews\/([^/]+)\/threads$/.exec(pathname);
  if (threadsMatch) {
    const slug = decodeURIComponent(threadsMatch[1]);
    const found = await locate(slug);
    if (!found) return json(res, 400, { error: 'bad slug' });
    if (!found.mr) return json(res, 404, { error: 'no tracked merge request for this review' });
    try {
      return json(res, 200, { threads: await reviewThreads(found.project, found.mr) });
    } catch (err) {
      return json(res, 502, { error: String(err.message).slice(0, 300) });
    }
  }

  const diffMatch = /^\/api\/reviews\/([^/]+)\/diff$/.exec(pathname);
  if (diffMatch) {
    const slug = decodeURIComponent(diffMatch[1]);
    const found = await locate(slug);
    if (!found) return json(res, 400, { error: 'bad slug' });
    const { project, mr } = found;
    if (!mr) return json(res, 404, { error: 'no tracked merge request for this review' });
    const versionId = searchParams.get('version');
    const mode = searchParams.get('mode') === 'since' ? 'since' : 'full';
    if (versionId && !/^[\w-]+$/.test(versionId)) return json(res, 400, { error: 'bad version' });
    try {
      // The live diff, unless it is about what an earlier review saw or what changed since it.
      if (versionId || mode === 'since') {
        const { status, ...body } = await reviewDiff(project, mr, found.slug, { versionId, mode, stopId: searchParams.get('stop') });
        return json(res, status, body);
      }
      let files = (await listMergeRequestDiffs(project, mr.iid)).map(toDiffFile);
      const stopId = searchParams.get('stop');
      if (stopId) {
        const shape = await loadShape(project.reviewsDir, found.slug, '');
        const stop = (shape.tour ?? []).find((s) => s.id === stopId);
        files = stop ? filesForPatterns(files, stop.files) : [];
      }
      return json(res, 200, { files });
    } catch (err) {
      return json(res, 502, { error: String(err.message).slice(0, 300) });
    }
  }

  if (pathname.startsWith('/api/reviews/')) {
    let slug;
    try {
      slug = decodeURIComponent(pathname.slice('/api/reviews/'.length));
    } catch {
      return json(res, 400, { error: 'bad slug' });
    }
    const where = parseReviewId(slug, PROJECTS);
    if (!where) return json(res, 400, { error: 'bad slug' });
    try {
      const md = await readFile(join(where.project.reviewsDir, `${where.slug}.md`), 'utf8');
      return json(res, 200, { slug, kind: kindOf(where.slug), markdown: md, shape: await loadShape(where.project.reviewsDir, where.slug, md) });
    } catch {
      return json(res, 404, { error: 'not found' });
    }
  }

  if (pathname === '/events') {
    res.writeHead(200, { 'content-type': 'text/event-stream', 'cache-control': 'no-store', connection: 'keep-alive' });
    res.write('retry: 3000\n\n');
    clients.add(res);
    req.on('close', () => clients.delete(res));
    return undefined;
  }

  return serveStatic(pathname, res);
}

export function startStudio() {
  const server = createServer((req, res) => {
    handle(req, res).catch((err) => json(res, 500, { error: String(err.message ?? err) }));
  });
  server.on('error', (err) => console.error(`[studio] ${err.code === 'EADDRINUSE' ? `port ${STUDIO_PORT} already in use` : err.message}`));
  server.listen(Number(STUDIO_PORT), '127.0.0.1', () => {
    console.log(`[studio] http://localhost:${STUDIO_PORT}`);
  });
  // Closed with the server, so it can be stopped cleanly (tests start and stop it).
  const watchers = [];
  for (const project of PROJECTS) {
    try {
      watchers.push(watch(project.reviewsDir, broadcast));
    } catch {
      /* dir may not exist yet; the poller creates it, SSE just stays quiet */
    }
  }
  // Watch the directory, not the files: status.json and settings.json are
  // written via tmp + rename, which leaves a file-level watcher on the old inode.
  try {
    watchers.push(watch(dirname(STATUS_FILE), (_e, name) => (name === 'settings.json' || name === 'status.json') && broadcast()));
  } catch {
    /* same */
  }
  server.on('close', () => {
    for (const w of watchers) w.close();
    for (const res of clients) res.end();
  });
  return server;
}

if (import.meta.url === `file://${process.argv[1]}`) startStudio();
