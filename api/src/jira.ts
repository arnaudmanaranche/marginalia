import { logger } from './logger.ts';
import { JIRA_API_TOKEN, JIRA_BASE_URL, JIRA_EMAIL } from './config.ts';

export const jiraEnabled = Boolean(JIRA_BASE_URL && JIRA_EMAIL && JIRA_API_TOKEN);

const KEY_RE = /\b([A-Z][A-Z0-9]+-\d+)\b/;

// The ticket key is looked for in the title, then the branch, then the
// description: teams name it in different places.
export function jiraKeyOf(mr) {
  for (const text of [mr.title, mr.source_branch?.toUpperCase(), mr.description]) {
    const m = KEY_RE.exec(text ?? '');
    if (m) return m[1];
  }
  return null;
}

/** @returns {Promise<any>} */
async function jiraRequest(path: string): Promise<any> {
  const auth = Buffer.from(`${JIRA_EMAIL}:${JIRA_API_TOKEN}`).toString('base64');
  const res = await fetch(`${JIRA_BASE_URL.replace(/\/+$/, '')}/rest/api/3${path}`, {
    headers: { Authorization: `Basic ${auth}`, Accept: 'application/json' },
  });
  if (!res.ok) throw new Error(`Jira ${path} -> ${res.status}`);
  return res.json();
}

// Jira lists priorities in the order the site configured them, most urgent
// first, so the index is the rank. Fetched once per process.
/** @type {Promise<Map<string, number>> | null} */
let ranks: Promise<Map<string, number>> | null = null;
async function priorityRanks() {
  ranks ??= jiraRequest('/priority').then((list) => new Map(list.map((p, i) => [p.id, i])));
  return ranks;
}

// { key, priority, rank } for the MR's ticket, or null when Jira isn't
// configured, the MR names no ticket, or the lookup fails (logged, never fatal).
export async function jiraPriorityOf(mr) {
  if (!jiraEnabled) return null;
  const key = jiraKeyOf(mr);
  if (!key) return null;
  try {
    const [issue, byId] = await Promise.all([jiraRequest(`/issue/${key}?fields=priority`), priorityRanks()]);
    const p = issue.fields?.priority;
    return { key, priority: p?.name ?? null, rank: p ? byId.get(p.id) ?? null : null };
  } catch (err) {
    logger.warn({ key }, `Jira lookup failed: ${err.message}`);
    return { key, priority: null, rank: null };
  }
}

// Jira's rich text (Atlassian Document Format) as plain text: paragraphs, list items and headings
// on their own lines. Pure.
export function adfText(node) {
  if (!node || typeof node !== 'object') return '';
  if (node.type === 'text') return node.text ?? '';
  const inner = (node.content ?? []).map(adfText).join('');
  if (node.type === 'listItem') return `- ${inner.trim()}\n`;
  if (['paragraph', 'heading', 'codeBlock', 'blockquote'].includes(node.type)) return `${inner.trim()}\n\n`;
  if (node.type === 'hardBreak') return '\n';
  return inner;
}

// Whether the bot can read ticket `key` (a run's preflight): throws when it cannot.
export const jiraCanRead = (key) => jiraRequest(`/issue/${key}?fields=summary`);

// The MR's ticket as a reviewer reads it: summary and description (acceptance criteria included),
// or null when Jira isn't configured or the MR names no ticket. `{ key, error }` when it failed.
export async function jiraTicketOf(mr) {
  const key = jiraKeyOf(mr);
  if (!jiraEnabled || !key) return key ? { key, summary: null, text: null } : null;
  try {
    const issue = await jiraRequest(`/issue/${key}?fields=summary,description`);
    return { key, summary: issue.fields?.summary ?? null, text: adfText(issue.fields?.description).trim().slice(0, 8000) || null };
  } catch (err) {
    logger.warn({ key }, `Jira lookup failed: ${err.message}`);
    return { key, summary: null, text: null };
  }
}

// Most urgent ticket first, MRs without a known priority last; ties keep the
// newest review first.
export function byPriorityThenDate(a, b) {
  const ra = a.jira?.rank ?? Infinity;
  const rb = b.jira?.rank ?? Infinity;
  if (ra !== rb) return ra - rb;
  return b.reviewedAt.localeCompare(a.reviewedAt);
}
