import { createHash } from 'node:crypto';
import { readFile } from 'node:fs/promises';
import { join } from 'node:path';

// What the studio relies on, whatever skill or command wrote the review.
//
// A review command is free to write its report however it likes. This module
// turns that report into one normalized "shape", with a fixed vocabulary:
//
//   { version: 1, source, verdict, summary, findings, warnings }
//
// - verdict:  'APPROVE' | 'REQUEST_CHANGES' | 'OTHER' | null
// - findings: [{ id, severity, title, path, line, body, comment }]
//             severity is 'critical' | 'important' | 'suggestion' | 'info'
//             comment is the text ready to post on the MR, or null
// - source:   where the shape came from, in order of preference:
//               'json'      the command wrote .marginalia-findings.json
//               'markdown'  read from the report's sections and blockquotes
//               'none'      nothing could be read; the studio says so
// - warnings: what the studio should tell the person (never silent degradation)
//
// The shape is written next to the report (<slug>.findings.json) and is what
// the studio lists, counts and posts from.

// Where the injected contract asks the run to write its structured findings.
export const FINDINGS_FILE = '.marginalia-findings.json';

export const SEVERITIES = ['critical', 'important', 'suggestion', 'info'];
export const VERDICTS = ['APPROVE', 'REQUEST_CHANGES', 'OTHER'];

const SEVERITY_ALIASES = [
  [/^(critical|blocker|blocking|bloquant|bloquante|critique|must[ _-]?fix|high|severe)$/, 'critical'],
  [/^(important|major|majeur|majeure|should[ _-]?fix|warning|medium|moderate)$/, 'important'],
  [/^(suggestion|suggestions|nit|nitpick|minor|mineur|mineure|optional|low|improvement|style)$/, 'suggestion'],
  [/^(info|note|question|praise|positive|fyi)$/, 'info'],
];

export function normalizeSeverity(value) {
  const key = String(value ?? '').trim().toLowerCase();
  return SEVERITY_ALIASES.find(([re]) => re.test(key))?.[1] ?? null;
}

const strip = (t) => String(t).normalize('NFD').replace(/[̀-ͯ]/g, '').toUpperCase();

export function normalizeVerdict(value) {
  if (value === null || value === undefined) return null;
  const v = strip(value).replace(/[*_`]/g, '').trim();
  if (!v) return null;
  if (/^(APPROV|APPROUV|LGTM|ACCEPT|OK\b)/.test(v)) return 'APPROVE';
  if (/REQUEST|CHANGE|REJECT|BLOCK|MODIF|REFUS|NOT APPROV|NEEDS? WORK|DEMANDE/.test(v)) return 'REQUEST_CHANGES';
  return 'OTHER';
}

const plain = (t) => t
  .replace(/\[([^\]]+)\]\([^)]*\)/g, '$1')
  .replace(/[*`>]/g, '')
  .replace(/\s+/g, ' ')
  .trim();
const clip = (t, n) => (t.length > n ? `${t.slice(0, n - 1).trimEnd()}…` : t);

// A repo-relative path (it has a slash and an extension), with an optional line.
const PATH_IN_TEXT = /(?<![\w/.:@-])((?:\.\/)?(?:[\w@.~-]+\/)+[\w@.~-]+\.[A-Za-z0-9]+)(?::(\d+)(?:-\d+)?)?/;

export function cleanPath(path) {
  if (typeof path !== 'string') return null;
  const p = path.trim().replace(/^(\.\/|[ab]\/)/, '');
  return p && p.length <= 500 && !p.includes('\0') ? p : null;
}

// A file at the repo root (`.gitlab-ci.yml`, `package.json`): no directory, so only a
// well-known extension keeps "Next.js" or "e.g." from passing for a file.
const ROOT_FILE_IN_TEXT = /(?<![\w/.:@-])(\.?[\w@-]+(?:\.[\w@-]+)*\.(?:tsx?|mjs|cjs|json|ya?ml|md|toml|lock|sh))(?::(\d+)(?:-\d+)?)?(?![\w/])/;

// A path with a directory is a surer anchor than a bare file name.
function locate(text) {
  const m = text.match(PATH_IN_TEXT) ?? text.match(ROOT_FILE_IN_TEXT);
  if (!m) return { path: null, line: null };
  return { path: cleanPath(m[1]), line: m[2] ? Number(m[2]) : null };
}

const normTitle = (s) => s.toLowerCase().normalize('NFD').replace(/[̀-ͯ]/g, '').replace(/[^a-z0-9]+/g, ' ').trim();

// Stable across re-runs: it names the place and the point, not the wording of
// the comment, so a reworded comment is still the same finding.
export function findingId({ path, title, body }) {
  const subject = normTitle(title || body || '').slice(0, 80);
  return createHash('sha1').update(`${path ?? ''}|${subject}`).digest('hex').slice(0, 10);
}

function assignIds(findings) {
  const seen = new Set();
  return findings.map((f) => {
    const base = f.id ?? findingId(f);
    let id = base;
    for (let n = 2; seen.has(id); n += 1) id = `${base}-${n}`;
    seen.add(id);
    return { ...f, id };
  });
}

const str = (v, max) => (typeof v === 'string' && v.trim() ? v.trim().slice(0, max) : null);

// A finding as written by a command (any extra field is ignored). Returns
// { finding } or { warning }.
function normalizeFinding(raw, index) {
  if (!raw || typeof raw !== 'object') return { warning: `finding #${index + 1} is not an object` };
  const body = str(raw.body ?? raw.description ?? raw.details ?? raw.text, 10_000);
  const title = str(raw.title ?? raw.summary ?? raw.name, 300) ?? (body ? clip(plain(body.split('\n')[0]), 120) : null);
  if (!title) return { warning: `finding #${index + 1} has no title or body` };
  const severity = normalizeSeverity(raw.severity ?? raw.level ?? raw.priority);
  const fallback = locate(`${title} ${body ?? ''}`);
  const path = cleanPath(raw.path ?? raw.file) ?? null;
  const line = Number.isInteger(raw.line) && raw.line >= 1 ? raw.line : null;
  const id = typeof raw.id === 'string' && /^[\w-]{1,56}$/.test(raw.id) ? raw.id : undefined;
  return {
    finding: {
      id,
      severity: severity ?? 'info',
      title,
      path,
      line: path ? line : null,
      body: body ?? title,
      comment: str(raw.comment ?? raw.suggestedComment ?? raw.suggested_comment, 10_000),
      // A skill that names the place in the text but not in `path` still gets anchored.
      ...(path === null && fallback.path ? { path: fallback.path, line: fallback.line } : {}),
    },
    ...(severity === null && raw.severity !== undefined ? { warning: `finding "${clip(title, 40)}" has an unknown severity "${String(raw.severity).slice(0, 20)}", shown as info` } : {}),
  };
}

// Validates and normalizes what a command put in .marginalia-findings.json.
// Lenient: it keeps what it can and says what it dropped.
export function normalizeFindingsData(data) {
  const warnings = [];
  if (!data || typeof data !== 'object' || Array.isArray(data)) return { ok: false, error: 'the file is not a JSON object' };
  if (data.findings !== undefined && !Array.isArray(data.findings)) return { ok: false, error: '"findings" is not an array' };
  const findings = [];
  (data.findings ?? []).forEach((raw, i) => {
    const r = normalizeFinding(raw, i);
    if (r.warning) warnings.push(r.warning);
    if (r.finding) findings.push(r.finding);
  });
  const verdict = normalizeVerdict(data.verdict);
  if (data.verdict !== undefined && data.verdict !== null && verdict === null) warnings.push('the verdict is empty');
  const summary = str(data.summary ?? data.overview, 2000);
  return { ok: true, verdict, summary: summary ? clip(plain(summary), 400) : null, findings: assignIds(findings), warnings };
}

// The command may wrap the JSON in a code fence.
export function parseFindingsJson(raw) {
  let text = String(raw).trim();
  const fenced = text.match(/^```(?:json)?\s*\n([\s\S]*?)\n```$/);
  if (fenced) text = fenced[1];
  try {
    return normalizeFindingsData(JSON.parse(text));
  } catch (err) {
    return { ok: false, error: `not valid JSON (${String(err.message).slice(0, 80)})` };
  }
}

// --- Reading a report that has no structured findings -----------------------

// Tolerates "**Verdict:**", "**Verdict :**", "**Verdict**:" and French labels.
const VERDICT_LINE = /\*\*\s*(?:verdict|d[ée]cision|conclusion)\s*:?\s*\*\*\s*:?\s*([^\n]+)/i;

export function parseVerdict(md) {
  const m = md.match(VERDICT_LINE);
  return m ? normalizeVerdict(m[1]) : null;
}

const HEADING_SEVERITIES = [
  [/critical|critique|blocker|blocking|bloquant|must[ -]fix/i, 'critical'],
  [/important|major|majeur|should[ -]fix|warning|[àa] corriger/i, 'important'],
  [/suggestion|nit|minor|mineur|optional|improvement|am[ée]lioration/i, 'suggestion'],
];

const NOTHING = /^[-*]\s+(none|no\b|n\/a|nothing|rien|aucun)/i;

// Short text shown on cards: the "Overview" line, else the first real paragraph.
export function extractSummary(md) {
  const overview = md.match(/\*\*(?:Overview|Summary|R[ée]sum[ée])\s*:\s*\*\*\s*([^\n]+)/i)?.[1];
  if (overview) return clip(plain(overview), 400);
  const para = md.split(/\n\s*\n/).map((p) => p.trim()).find((p) => p.length > 40 && !/^[#|>\-*`]/.test(p));
  return para ? clip(plain(para), 400) : null;
}

function toFinding(severity, lines) {
  const quote = [];
  const rest = [];
  for (const l of lines) {
    if (/^\s*>/.test(l)) quote.push(l);
    // The label before a comment: the studio's card already carries it.
    else if (!/^\s*\**comment to post\s*:?\**\s*$/i.test(l)) rest.push(l);
  }
  const body = rest.join('\n').replace(/^[-*]\s+/, '').trim();
  const comment = quote
    .map((l) => l.replace(/^\s*>\s?/, ''))
    .filter((l, i) => !(i === 0 && /^comment to post\s*:?$/i.test(l.replace(/\*/g, '').trim())))
    .join('\n')
    .trim();
  const bold = body.match(/^\*\*([^*]+)\*\*/)?.[1];
  const firstLine = plain(body.split('\n')[0]);
  const title = clip(plain(bold ?? firstLine) || plain(comment.split('\n')[0]), 120);
  if (!title) return null;
  const here = locate(body.split(/\n\s*\n/)[0]);
  const { path, line } = here.path ? here : locate(comment);
  return { severity, title, path, line: path ? line : null, body: body || comment, comment: comment || null };
}

// Findings under "Critical / Important / Suggestions"-style headings: each
// top-level bullet is one finding, and a blockquote under it is its comment.
// A blockquote with no bullet above it is a finding of its own.
export function findingsFromMarkdown(md) {
  const out = [];
  let severity = null;
  let fence = false;
  let current = null;
  const flush = () => {
    if (current) {
      const f = toFinding(severity ?? 'info', current);
      if (f) out.push(f);
    }
    current = null;
  };
  for (const line of md.split('\n')) {
    if (/^```/.test(line)) fence = !fence;
    if (!fence && /^#{2,3}\s/.test(line)) {
      flush();
      severity = HEADING_SEVERITIES.find(([re]) => re.test(line))?.[1] ?? null;
      continue;
    }
    if (!severity) continue;
    if (!fence && /^[-*]\s/.test(line)) {
      flush();
      if (!NOTHING.test(line)) current = [line];
      continue;
    }
    if (!fence && /^\s*>/.test(line) && current === null) {
      current = [line];
      continue;
    }
    if (current) current.push(line);
  }
  flush();
  return out;
}

export function deriveFromMarkdown(md) {
  return {
    verdict: parseVerdict(md),
    summary: extractSummary(md),
    findings: assignIds(findingsFromMarkdown(md)),
  };
}

// --- The shape ----------------------------------------------------------------

export const NO_FINDINGS_WARNING = 'No findings could be read from this report: it has no structured findings file and no Critical / Important / Suggestion sections. Per-finding "Add to review" is unavailable; use the comment box under Discussion.';

// `findingsRaw` is the content of .marginalia-findings.json, or null when the
// command wrote none.
export function buildShape({ markdown, findingsRaw = null }) {
  const warnings = [];
  const derived = deriveFromMarkdown(markdown);
  if (findingsRaw !== null) {
    const parsed = parseFindingsJson(findingsRaw);
    if (!parsed.ok) {
      warnings.push(`The findings file was ignored: ${parsed.error}.`);
    } else if (!parsed.findings.length && !parsed.verdict) {
      warnings.push('The findings file was ignored: it has no findings and no verdict.');
    } else {
      warnings.push(...parsed.warnings.map((w) => `Findings file: ${w}.`));
      return {
        version: 1,
        source: 'json',
        verdict: parsed.verdict ?? derived.verdict,
        summary: parsed.summary ?? derived.summary,
        findings: parsed.findings,
        warnings,
      };
    }
  }
  if (!derived.findings.length) warnings.push(NO_FINDINGS_WARNING);
  else if (derived.verdict === null) warnings.push('No verdict was found in this report.');
  return {
    version: 1,
    source: derived.findings.length ? 'markdown' : 'none',
    verdict: derived.verdict,
    summary: derived.summary,
    findings: derived.findings,
    warnings,
  };
}

// What the studio's review list shows, from a shape.
export function listFields(shape) {
  const count = (s) => shape.findings.filter((f) => f.severity === s).length;
  const highlights = [];
  for (const severity of ['critical', 'important']) {
    for (const f of shape.findings.filter((x) => x.severity === severity).slice(0, 2)) {
      highlights.push({ severity, text: clip(plain(f.body), 150) });
    }
  }
  return {
    verdict: shape.verdict,
    critical: count('critical'),
    important: count('important'),
    summary: shape.summary,
    highlights,
    postable: shape.findings.filter((f) => f.comment).length,
    contract: { source: shape.source, warnings: shape.warnings },
  };
}

export const shapePath = (reviewsDir, slug) => join(reviewsDir, `${slug}.findings.json`);

// The shape stored next to a review, or one derived from the markdown for a
// review written before shapes were stored.
export async function loadShape(reviewsDir, slug, markdown) {
  try {
    const stored = JSON.parse(await readFile(shapePath(reviewsDir, slug), 'utf8'));
    if (stored?.version === 1 && Array.isArray(stored.findings)) return stored;
  } catch {
    /* no stored shape */
  }
  return buildShape({ markdown });
}
