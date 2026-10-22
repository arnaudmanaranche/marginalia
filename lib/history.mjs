// @ts-check
import { copyFile, mkdir, readFile, readdir, stat } from 'node:fs/promises';
import { basename, dirname, join } from 'node:path';

// Previous versions of a review. A re-run overwrites <slug>.md, so the file it
// replaces is first copied to .history/<slug>/<timestamp>.md (the timestamp is
// when that version was written). The dot-directory keeps these out of the
// studio's review list, which only reads *.md at the top of the reviews dir.
const historyDir = (reviewsDir, slug) => join(reviewsDir, '.history', slug);

const idOf = (date) => date.toISOString().replace(/[:.]/g, '-');
// The ISO time an id stands for (the reverse of idOf).
export const versionTime = (id) => id.replace(/^(\d{4}-\d{2}-\d{2}T\d{2})-(\d{2})-(\d{2})-(\d{3})Z$/, '$1:$2:$3.$4Z');

// Copies the review at `path` aside if it exists and differs from `nextContent`.
// Returns the version id, or null when there was nothing to keep.
export async function archiveReview(path, nextContent) {
  let previous;
  let mtime;
  try {
    [previous, mtime] = await Promise.all([readFile(path, 'utf8'), stat(path).then((s) => s.mtime)]);
  } catch {
    return null;
  }
  if (previous === nextContent) return null;
  const slug = basename(path, '.md');
  const id = idOf(mtime);
  const dir = historyDir(dirname(path), slug);
  await mkdir(dir, { recursive: true });
  await copyFile(path, join(dir, `${id}.md`));
  // The normalized findings that went with it, when it had them.
  await copyFile(path.replace(/\.md$/, '.findings.json'), join(dir, `${id}.findings.json`)).catch(() => {});
  return id;
}

// Versions of one review, newest first.
export async function listHistory(reviewsDir, slug) {
  let names = [];
  try {
    names = (await readdir(historyDir(reviewsDir, slug))).filter((n) => n.endsWith('.md'));
  } catch {
    return [];
  }
  return names
    .map((n) => n.slice(0, -3))
    .sort()
    .reverse()
    .map((id) => ({ id, at: versionTime(id) }));
}

// { markdown, shape } of one version; shape is null for a version kept before
// findings were stored (the caller derives one from the markdown).
export async function readHistory(reviewsDir, slug, id) {
  if (!/^[\w-]+$/.test(id)) return null;
  try {
    const markdown = await readFile(join(historyDir(reviewsDir, slug), `${id}.md`), 'utf8');
    const shape = await readFile(join(historyDir(reviewsDir, slug), `${id}.findings.json`), 'utf8').then(JSON.parse, () => null);
    return { markdown, shape };
  } catch {
    return null;
  }
}

const MAX_THREAD_CHARS = 6000;

// The threads as plain text, truncated. `me` names the bot's user in that role; `ids` names each
// thread by its GitLab discussion id, for a reply to point at.
function threadText(threads, me, { ids = false } = {}) {
  const lines = [];
  for (const t of threads) {
    const where = t.path ? ` on ${t.path}${t.line ? `:${t.line}` : ''}` : '';
    lines.push(`- Thread${ids ? ` ${t.id}` : ''}${where}${t.resolved ? ' (resolved)' : ''}:`);
    for (const n of t.notes) lines.push(`  - ${n.mine ? me : n.author}: ${n.body.replace(/\s+/g, ' ').trim()}`);
  }
  const text = lines.join('\n');
  return text.length > MAX_THREAD_CHARS ? `${text.slice(0, MAX_THREAD_CHARS)}\n  [...truncated]` : text;
}

// What the re-run is told about the conversation so far, so it neither repeats a
// point the author already addressed nor ignores a reply. Skill-agnostic: it is
// plain text appended to the system prompt, whatever the review command is.
export function discussionPrompt(threads) {
  if (!threads.length) return '';
  return [
    'This merge request already has a review conversation on GitLab (below). The author may have pushed fixes in reply.',
    'Do not repeat a point that was addressed. If a reply claims a fix, check the code and say so only if it is not actually fixed or is only partly fixed. Mention anything a reply left open.',
    '',
    threadText(threads, 'me (the reviewer)'),
  ].join('\n');
}

// The comments a triage works on. The bot reads them with its own token, so the
// run needs no GitLab MCP server or API access to fetch them.
export function triageDiscussionPrompt(threads) {
  const open = threads.filter((t) => !t.resolved);
  return [
    'The unresolved discussion threads of this merge request, fetched by marginalia from GitLab, are below, each with its id. They are the reviewer comments to triage: use them as is and do not try to fetch the discussions yourself.',
    '',
    open.length ? threadText(open, 'me (the MR author)', { ids: true }) : '(none: there is no unresolved thread)',
  ].join('\n');
}
