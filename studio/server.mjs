// Local review reader: JSON API over REVIEWS_DIR + status.json, live updates
// over SSE, and the built React app (studio/dist) as static files. Bound to
// 127.0.0.1 only; read-only apart from PUT /api/settings (poll interval) and,
// when ALLOW_POSTING=true, POST /api/post (comment on the MR, after confirmation),
// and POST /api/rerun (queue a fresh review of one MR).
import { createServer } from 'node:http';
import { readFile, readdir, stat } from 'node:fs/promises';
import { watch } from 'node:fs';
import { join, dirname, extname, normalize } from 'node:path';
import { fileURLToPath } from 'node:url';
import { REVIEWS_DIR, STATUS_FILE, STUDIO_PORT, ALLOW_POSTING, JIRA_BASE_URL } from '../lib/config.mjs';
import { TRIAGE_FILE_PREFIX } from '../lib/paths.mjs';
import { loadPosted, savePosted } from '../lib/posted.mjs';
import { listHistory, readHistory } from '../lib/history.mjs';
import { createDraftNote, createDraftReply, createInlineDraftNote, listDiscussions, listDraftNotes, updateDraftNote, deleteDraftNote, publishDraftNotes, draftNoteExists, findPublishedNoteId, mergeRequestNoteExists } from '../lib/gitlab.mjs';
import { byPriorityThenDate } from '../lib/jira.mjs';
import { loadSettings, saveSettings } from '../lib/settings.mjs';
import { loadState, saveState } from '../lib/state.mjs';
import { parseAcrossLayers } from '../lib/stack.mjs';

const DIST = join(dirname(fileURLToPath(import.meta.url)), 'dist');
const SLUG_RE = /^[\w.-]+$/;
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

// Tolerates "**Verdict:**" and "**Verdict :**" and trailing remarks.
function parseVerdict(md) {
  const m = md.match(/\*\*Verdict\s*:\s*\*\*\s*([^\n]+)/i);
  if (!m) return null;
  const v = m[1].toUpperCase();
  if (v.startsWith('REQUEST CHANGES')) return 'REQUEST_CHANGES';
  if (v.startsWith('APPROVE')) return 'APPROVE';
  return 'OTHER';
}

// Number of bullet points under a "### <heading>" section of the review.
function countBullets(md, headingRe) {
  const lines = md.split('\n');
  let inside = false;
  let count = 0;
  for (const line of lines) {
    if (/^#{2,3}\s/.test(line)) inside = headingRe.test(line);
    else if (inside && /^-\s/.test(line) && !/^-\s+(none|no\b|n\/a)/i.test(line)) count += 1;
  }
  return count;
}

const plain = (t) => t
  .replace(/\[([^\]]+)\]\([^)]*\)/g, '$1')
  .replace(/[*`>]/g, '')
  .replace(/\s+/g, ' ')
  .trim();
const clip = (t, n) => (t.length > n ? `${t.slice(0, n - 1).trimEnd()}…` : t);

// Short text shown on large cards: the "Overview" line of a review, else the
// first real paragraph.
function extractSummary(md) {
  const overview = md.match(/\*\*Overview\s*:\s*\*\*\s*([^\n]+)/i)?.[1];
  if (overview) return clip(plain(overview), 400);
  const para = md.split(/\n\s*\n/).map((p) => p.trim()).find((p) => p.length > 40 && !/^[#|>\-*`]/.test(p));
  return para ? clip(plain(para), 400) : null;
}

// First few Critical / Important bullets, for large cards.
function extractHighlights(md) {
  const out = [];
  let severity = null;
  let fence = false;
  for (const line of md.split('\n')) {
    if (/^```/.test(line)) fence = !fence;
    if (fence) continue;
    if (/^#{2,3}\s/.test(line)) {
      severity = /critical/i.test(line) ? 'critical' : /important/i.test(line) ? 'important' : null;
    } else if (severity && /^-\s/.test(line) && !/^-\s+(none|no\b|n\/a)/i.test(line)) {
      if (out.filter((h) => h.severity === severity).length < 2) out.push({ severity, text: clip(plain(line.slice(2)), 150) });
    }
  }
  return out;
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
      if (!info.iid) continue;
      try {
        if (info.state === 'draft') {
          if (await draftNoteExists(info.iid, info.draftId)) continue;
          // Gone from the drafts: published from GitLab itself, or deleted there.
          const noteId = info.body ? await findPublishedNoteId(info.iid, info.body) : null;
          if (noteId) {
            posted[key] = { ...info, state: 'published', url: `${info.mrUrl}#note_${noteId}` };
            delete posted[key].draftId;
          } else delete posted[key];
          changed = true;
          continue;
        }
        const noteId = info.url?.match(/#note_(\d+)$/)?.[1];
        if (noteId && !(await mergeRequestNoteExists(info.iid, noteId))) {
          delete posted[key];
          changed = true;
        }
      } catch {
        /* GitLab unreachable: keep it for now */
      }
    }
    if (changed) await savePosted(posted);
  });
  postQueue = run.catch(() => {});
  await run.catch(() => {});
}

// The MR tracked in status.json for a review slug, or undefined.
async function trackedMr(slug) {
  const status = await readStatus();
  return (status?.mrs ?? []).find((m) => m.reviewPath && m.reviewPath === join(REVIEWS_DIR, `${slug}.md`));
}

// Stacks of 2+ MRs from status.json, layers bottom to top. A layer without a
// review file yet has slug null.
function buildStacks(status) {
  const byId = new Map();
  for (const mr of status?.mrs ?? []) {
    if (mr.kind !== 'review' || !mr.stack) continue;
    if (!byId.has(mr.stack.id)) byId.set(mr.stack.id, { id: mr.stack.id, baseBranch: mr.stack.baseBranch, layers: [] });
    byId.get(mr.stack.id).layers.push({
      iid: mr.iid,
      title: mr.title,
      webUrl: mr.web_url,
      slug: mr.reviewPath ? mr.reviewPath.split('/').pop().replace(/\.md$/, '') : null,
      status: mr.status,
      parentIid: mr.stack.parentIid,
      position: mr.stack.position,
    });
  }
  return [...byId.values()].map((st) => ({ ...st, layers: st.layers.sort((a, b) => a.position - b.position) }));
}

async function listReviews() {
  await reconcilePosted();
  const status = await readStatus();
  const byPath = new Map((status?.mrs ?? []).map((mr) => [mr.reviewPath, mr]));
  let names = [];
  try {
    names = (await readdir(REVIEWS_DIR)).filter((n) => n.endsWith('.md'));
  } catch {
    /* reviews dir not created yet */
  }
  const items = await Promise.all(names.map(async (name) => {
    const slug = name.slice(0, -3);
    const path = join(REVIEWS_DIR, name);
    const [md, st] = await Promise.all([readFile(path, 'utf8'), stat(path)]);
    const mr = byPath.get(path);
    const title = md.match(/^#\s+(.+)$/m)?.[1] ?? null;
    return {
      slug,
      kind: kindOf(slug),
      title: mr?.title ?? title ?? slug,
      iid: mr?.iid ?? md.match(/\bMR:?\s*!(\d+)/i)?.[1] ?? md.match(/\bMR !(\d+)/)?.[1] ?? null,
      author: mr?.author ?? null,
      webUrl: mr?.web_url ?? null,
      branch: md.match(/\*\*Branch:\*\*\s*([^\s|]+)/)?.[1] ?? null,
      verdict: parseVerdict(md),
      critical: countBullets(md, /critical/i),
      important: countBullets(md, /important/i),
      summary: extractSummary(md),
      highlights: extractHighlights(md),
      stackId: mr?.stack?.id ?? null,
      crossLayer: parseAcrossLayers(md),
      // Reviewed before, but the commit (or the layer below) moved since.
      stale: mr?.status === 'pending' && Boolean(mr?.reviewedAt),
      mtime: st.mtime.toISOString(),
      reviewedAt: mr?.reviewedAt ?? st.mtime.toISOString(),
      tracked: Boolean(mr),
      jira: mr?.jira ?? null,
    };
  }));
  items.sort(byPriorityThenDate);
  // https://host/group/project, from any tracked MR url; used to link !123 and file paths.
  const projectUrl = (status?.mrs ?? []).map((mr) => mr.web_url?.match(/^(.*)\/-\/merge_requests\/\d+/)?.[1]).find(Boolean) ?? null;
  return { status, items, stacks: buildStacks(status), projectUrl, jiraBaseUrl: JIRA_BASE_URL ? JIRA_BASE_URL.replace(/\/+$/, '') : null, settings: loadSettings(), allowPosting: ALLOW_POSTING === 'true', posted: await loadPosted() };
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
    return json(res, 200, await saveSettings(body));
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
  if (typeof slug !== 'string' || !SLUG_RE.test(slug) || typeof commentId !== 'string' || !/^[\w-]{1,64}$/.test(commentId)) {
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
    const status = await readStatus();
    const mr = (status?.mrs ?? []).find((m) => m.reviewPath && m.reviewPath === join(REVIEWS_DIR, `${slug}.md`));
    if (!mr) return json(res, 404, { error: 'no tracked merge request for this review' });
    const posted = await loadPosted();
    const key = `${slug}:${commentId}`;
    if (posted[key]) return json(res, 409, { error: 'already posted', posted: posted[key] });
    let draft;
    let text = body.trim();
    let inline = false;
    try {
      if (hasTarget) {
        try {
          draft = await createInlineDraftNote(mr.iid, text, path, line);
          inline = true;
        } catch (err) {
          // Typically a line outside the diff (400): keep the comment, drop the anchor.
          console.warn(`[studio] inline draft on ${path}${line ? `:${line}` : ''} failed, adding a general note: ${String(err.message).slice(0, 200)}`);
        }
      }
      if (!inline) {
        if (hasTarget) text = `\`${path}${line ? `:${line}` : ''}\`\n\n${text}`;
        draft = await createDraftNote(mr.iid, text);
      }
    } catch (err) {
      return json(res, 502, { error: String(err.message).slice(0, 300) });
    }
    posted[key] = { at: new Date().toISOString(), iid: mr.iid, state: 'draft', draftId: draft.id, body: text, mrUrl: mr.web_url, url: mr.web_url, inline: hasTarget ? inline : undefined };
    await savePosted(posted);
    broadcast();
    return json(res, 200, posted[key]);
  });
  postQueue = run.catch(() => {});
  return run;
}

// Replies { slug, discussionId, body } to a thread of the tracked MR, as a draft
// of the pending review. The discussion must belong to that MR: GitLab rejects
// an id from another one, and the MR itself comes from status.json.
async function replyToDiscussion(req, res) {
  if (ALLOW_POSTING !== 'true') return json(res, 403, { error: 'posting is disabled (ALLOW_POSTING=false)' });
  const input = await readJsonBody(req, res);
  if (input === null) return undefined;
  const { slug, discussionId, body } = input;
  if (typeof slug !== 'string' || !SLUG_RE.test(slug) || slug.includes('..') || typeof discussionId !== 'string' || !/^[0-9a-f]{8,64}$/.test(discussionId)) {
    return json(res, 400, { error: 'bad slug or discussionId' });
  }
  if (typeof body !== 'string' || !body.trim() || body.length > 10_000) {
    return json(res, 400, { error: 'body must be a non-empty string under 10000 characters' });
  }
  const run = postQueue.then(async () => {
    const mr = await trackedMr(slug);
    if (!mr) return json(res, 404, { error: 'no tracked merge request for this review' });
    let draft;
    try {
      draft = await createDraftReply(mr.iid, discussionId, body.trim());
    } catch (err) {
      return json(res, 502, { error: String(err.message).slice(0, 300) });
    }
    const posted = await loadPosted();
    posted[`${slug}:reply-${draft.id}`] = { at: new Date().toISOString(), iid: mr.iid, state: 'draft', draftId: draft.id, body: body.trim(), mrUrl: mr.web_url, url: mr.web_url };
    await savePosted(posted);
    broadcast();
    return json(res, 200, { ok: true, draftId: draft.id });
  });
  postQueue = run.catch(() => {});
  return run;
}

// Submits the drafts of one review as a real GitLab review, with an optional
// summary note. Like postComment(), the MR comes from status.json.
async function submitReview(req, res) {
  if (ALLOW_POSTING !== 'true') return json(res, 403, { error: 'posting is disabled (ALLOW_POSTING=false)' });
  const input = await readJsonBody(req, res);
  if (input === null) return undefined;
  const { slug, summary } = input;
  if (typeof slug !== 'string' || !SLUG_RE.test(slug)) return json(res, 400, { error: 'bad slug' });
  if (summary !== undefined && (typeof summary !== 'string' || summary.length > 10_000)) return json(res, 400, { error: 'summary must be a string under 10000 characters' });
  const run = postQueue.then(async () => {
    const status = await readStatus();
    const mr = (status?.mrs ?? []).find((m) => m.reviewPath && m.reviewPath === join(REVIEWS_DIR, `${slug}.md`));
    if (!mr) return json(res, 404, { error: 'no tracked merge request for this review' });
    const posted = await loadPosted();
    const drafts = Object.entries(posted).filter(([key, info]) => key.startsWith(`${slug}:`) && info.state === 'draft');
    const text = summary?.trim();
    if (!drafts.length && !text) return json(res, 400, { error: 'nothing to submit' });
    try {
      if (text) await createDraftNote(mr.iid, text);
      await publishDraftNotes(mr.iid);
    } catch (err) {
      return json(res, 502, { error: String(err.message).slice(0, 300) });
    }
    for (const [key, info] of drafts) {
      let noteId = null;
      try {
        noteId = await findPublishedNoteId(info.iid, info.body);
      } catch {
        /* the review is out; only the deep link is missing */
      }
      const { draftId, ...rest } = info;
      posted[key] = { ...rest, state: 'published', at: new Date().toISOString(), url: noteId ? `${info.mrUrl}#note_${noteId}` : info.mrUrl };
    }
    await savePosted(posted);
    broadcast();
    return json(res, 200, { submitted: drafts.length, summary: Boolean(text) });
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
  if (!SLUG_RE.test(slug) || slug.includes('..') || !idPart) return json(res, 400, { error: 'bad slug or draft id' });
  const draftId = Number(idPart);
  let text;
  if (req.method === 'PUT') {
    const input = await readJsonBody(req, res);
    if (input === null) return undefined;
    text = typeof input.body === 'string' ? input.body.trim() : '';
    if (!text || text.length > 10_000) return json(res, 400, { error: 'body must be a non-empty string under 10000 characters' });
  }
  const run = postQueue.then(async () => {
    const status = await readStatus();
    const mr = (status?.mrs ?? []).find((m) => m.reviewPath && m.reviewPath === join(REVIEWS_DIR, `${slug}.md`));
    if (!mr) return json(res, 404, { error: 'no tracked merge request for this review' });
    try {
      if (req.method === 'PUT') await updateDraftNote(mr.iid, draftId, text);
      else await deleteDraftNote(mr.iid, draftId);
    } catch (err) {
      return json(res, / -> 404:/.test(String(err.message)) ? 404 : 502, { error: String(err.message).slice(0, 300) });
    }
    // Keep the local record in step: a deleted draft can be added again, an edited one keeps its new text for matching.
    const posted = await loadPosted();
    const entry = Object.entries(posted).find(([, info]) => info.state === 'draft' && info.draftId === draftId && info.iid === mr.iid);
    if (entry) {
      if (req.method === 'DELETE') delete posted[entry[0]];
      else posted[entry[0]] = { ...entry[1], body: text };
      await savePosted(posted);
    }
    broadcast();
    return json(res, 200, { ok: true });
  });
  postQueue = run.catch(() => {});
  return run;
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
  if (typeof slug !== 'string' || !SLUG_RE.test(slug) || slug.includes('..')) return json(res, 400, { error: 'bad slug' });
  const status = await readStatus();
  const mr = (status?.mrs ?? []).find((m) => m.reviewPath && m.reviewPath === join(REVIEWS_DIR, `${slug}.md`));
  if (!mr) return json(res, 404, { error: 'no tracked merge request for this review' });
  let alive = false;
  try {
    alive = Boolean(status?.pid) && process.kill(status.pid, 0);
  } catch {
    /* no such process */
  }
  if (!alive || status.phase === 'stopped') return json(res, 409, { error: 'the bot is not running: start it with npm start' });
  if (status.phase !== 'idle' && status.phase !== 'error') return json(res, 409, { error: 'a run is in progress, try again when it is done' });
  const state = await loadState();
  if (mr.kind === 'comments') (state.mineComments ??= {})[mr.iid] = null;
  else state[mr.iid] = null;
  await saveState(state);
  process.kill(status.pid, 'SIGUSR1');
  return json(res, 200, { ok: true, iid: mr.iid, kind: mr.kind });
}

async function handle(req, res) {
  const { pathname } = new URL(req.url, 'http://localhost');
  if (req.method === 'PUT' && pathname === '/api/settings') return putSettings(req, res);
  if (req.method === 'POST' && pathname === '/api/post') return postComment(req, res);
  if (req.method === 'POST' && pathname === '/api/reply') return replyToDiscussion(req, res);
  if (req.method === 'POST' && pathname === '/api/submit-review') return submitReview(req, res);
  if (req.method === 'POST' && pathname === '/api/rerun') return rerunReview(req, res);
  if ((req.method === 'PUT' || req.method === 'DELETE') && pathname.startsWith('/api/drafts/')) return mutateDraft(req, res, pathname);
  if (req.method !== 'GET') return json(res, 405, { error: 'read-only' });

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
    if (!SLUG_RE.test(slug) || slug.includes('..')) return json(res, 400, { error: 'bad slug' });
    if (!idPart) return json(res, 200, { versions: await listHistory(slug) });
    const markdown = await readHistory(slug, idPart);
    return markdown === null ? json(res, 404, { error: 'not found' }) : json(res, 200, { slug, id: idPart, markdown });
  }

  // The MR's GitLab conversation, for the studio's discussion panel.
  if (pathname.startsWith('/api/discussions/')) {
    let slug;
    try {
      slug = decodeURIComponent(pathname.slice('/api/discussions/'.length));
    } catch {
      return json(res, 400, { error: 'bad slug' });
    }
    if (!SLUG_RE.test(slug) || slug.includes('..')) return json(res, 400, { error: 'bad slug' });
    const mr = await trackedMr(slug);
    if (!mr) return json(res, 404, { error: 'no tracked merge request for this review' });
    try {
      return json(res, 200, { discussions: await listDiscussions(mr.iid) });
    } catch (err) {
      return json(res, 502, { error: String(err.message).slice(0, 300) });
    }
  }

  if (pathname.startsWith('/api/drafts/')) {
    if (ALLOW_POSTING !== 'true') return json(res, 403, { error: 'posting is disabled (ALLOW_POSTING=false)' });
    let slug;
    try {
      slug = decodeURIComponent(pathname.slice('/api/drafts/'.length));
    } catch {
      return json(res, 400, { error: 'bad slug' });
    }
    if (!SLUG_RE.test(slug) || slug.includes('..')) return json(res, 400, { error: 'bad slug' });
    const status = await readStatus();
    const mr = (status?.mrs ?? []).find((m) => m.reviewPath && m.reviewPath === join(REVIEWS_DIR, `${slug}.md`));
    if (!mr) return json(res, 404, { error: 'no tracked merge request for this review' });
    try {
      return json(res, 200, { drafts: await listDraftNotes(mr.iid) });
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
    if (!SLUG_RE.test(slug) || slug.includes('..')) return json(res, 400, { error: 'bad slug' });
    try {
      const md = await readFile(join(REVIEWS_DIR, `${slug}.md`), 'utf8');
      return json(res, 200, { slug, kind: kindOf(slug), markdown: md });
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
  try {
    watch(REVIEWS_DIR, broadcast);
  } catch {
    /* dir may not exist yet; the poller creates it, SSE just stays quiet */
  }
  // Watch the directory, not the files: status.json and settings.json are
  // written via tmp + rename, which leaves a file-level watcher on the old inode.
  try {
    watch(dirname(STATUS_FILE), (_e, name) => (name === 'settings.json' || name === 'status.json') && broadcast());
  } catch {
    /* same */
  }
  return server;
}

if (import.meta.url === `file://${process.argv[1]}`) startStudio();
