// The staged review, as the agents are asked it: one agent maps the change (overview, risk,
// chapters), then one agent per chapter reviews it. Each answer is checked here before the next
// stage uses it. Pure: tested on plain values.
import { jsonAnswer, matchesPattern, text } from './json-answer.ts';

export const REVIEW_SYSTEM = "You are a senior engineer reviewing a colleague's merge request, as one stage of Marginalia's review. You only read and run read-only commands: never edit a file, never commit, never post anything on GitLab. Write everything in English, whatever language the MR, the ticket or the code comments use.";

const PLAIN = 'Write for someone who has not seen the code: name behaviour a user or a teammate would recognise, not functions or files. Names of code may come later in a summary, never in a title or in the overview.';

/** @param {string} context */
export function mapPrompt(context) {
  return [
    'Your stage: map the change, so the reviewers after you and the person reading the review grasp it without opening every file. Do not look for bugs yet.',
    '', context, '',
    'Read the diff (start with the files that carry the idea), the ticket and the description. Then answer:',
    '- overview: what the system did before this MR and what it does now, one or two plain sentences each. ' + PLAIN,
    '- risk: low (contained, tested, nothing sensitive), medium (behaviour change in shared code, or real logic with thin tests) or high (auth, payments, data, migrations, a public contract, concurrency, wide blast radius with weak tests), why in one sentence, and the factors as short strings.',
    '- chapters: one idea each, the core change first, then what supports it, and database, tests and generated files last. Every changed file belongs to exactly one chapter (a glob such as `src/flights/**` is fine). 1 or 2 chapters for a tiny MR, 3 to 8 otherwise. Each has a title naming the idea, a summary of two or three plain sentences (what changed and why, then what is safe to skim), and `check`: what the reviewer of this chapter must verify, concretely (the input that could break it, the caller that could be missed).',
    '',
    'Answer with only this JSON, in a ```json block:',
    '{"overview": {"before": "...", "after": "..."}, "risk": {"level": "low|medium|high", "rationale": "...", "factors": ["..."]}, "chapters": [{"title": "...", "summary": "...", "files": ["path or glob"], "check": "..."}]}',
  ].join('\n');
}

const RISKS = ['low', 'medium', 'high'];

// The map, checked: every changed file lands in a chapter (the ones the agent left out go to a last
// one, said in `warnings`).
/** @param {string} answer @param {string[]} changed */
export function parseMap(answer, changed) {
  const json = jsonAnswer(answer);
  if (!json.ok) return json;
  const { overview, risk, chapters } = json.value;
  if (!text(overview?.before) || !text(overview?.after)) return { ok: false, error: 'overview needs "before" and "after"' };
  if (!RISKS.includes(risk?.level)) return { ok: false, error: 'risk.level must be low, medium or high' };
  if (!Array.isArray(chapters) || !chapters.length) return { ok: false, error: '"chapters" must be a non-empty array' };
  const kept = chapters
    .map((c) => ({ title: text(c?.title, 200), summary: text(c?.summary, 1500) ?? '', check: text(c?.check, 1500) ?? '', files: (Array.isArray(c?.files) ? c.files : []).map((f) => text(f, 300)).filter(Boolean) }))
    .filter((c) => c.title && c.files.length)
    .slice(0, 12);
  if (!kept.length) return { ok: false, error: 'no chapter has a title and files' };
  const warnings: string[] = [];
  const left = changed.filter((p) => !kept.some((c) => c.files.some((f) => matchesPattern(f, p))));
  if (left.length) {
    kept.push({ title: 'The rest of the change', summary: 'Files the map did not place in a chapter.', check: 'Whatever these files change on their own.', files: left });
    warnings.push(`${left.length} changed file(s) were in no chapter of the map: reviewed in a last one`);
  }
  return {
    ok: true,
    value: {
      overview: { before: text(overview.before, 600), after: text(overview.after, 600) },
      risk: { level: risk.level, rationale: text(risk.rationale, 400) ?? '', factors: (Array.isArray(risk.factors) ? risk.factors : []).map((f) => text(f, 120)).filter(Boolean).slice(0, 8) },
      chapters: kept,
      warnings,
    },
  };
}

/** @param {{ context: string, map: any, chapter: any, index: number, checklist: string | null }} input */
export function chapterPrompt({ context, map, chapter, index, checklist }) {
  const others = map.chapters.map((c, i) => `${i + 1}. ${c.title}${i === index ? ' (yours)' : ''}`).join('\n');
  return [
    `Your stage: review chapter ${index + 1} of ${map.chapters.length}, "${chapter.title}". Other agents review the other chapters at the same time: stay on your files, read anything else only to understand them.`,
    '', context, '',
    `## The change, as mapped\nBefore: ${map.overview.before}\nAfter: ${map.overview.after}\nRisk: ${map.risk.level}, ${map.risk.rationale}\n\nChapters:\n${others}`,
    '',
    `## Your chapter\n${chapter.summary}\nFiles: ${chapter.files.join(', ')}\nWhat to verify: ${chapter.check}`,
    '',
    '## How to review',
    '- Learn the standard first: the rules files named above, then two or three files next to the changed ones. A finding that cites the repo\'s own rule or an existing example is worth ten that cite taste; with no rule on a point it is at most a suggestion.',
    checklist ? `- This repo keeps a review checklist in ${checklist}: read it, its checklists apply to your files.` : '',
    '- Verify, do not guess: for each behaviour change read the callers and the callees, not only the diff, and ask what input breaks it (empty, negative, concurrent, repeated, untrusted). Report what you confirmed; a suspicion you could not verify is at most a suggestion and says so.',
    '- Severity: critical (wrong behaviour, data loss, security hole, broken build: blocks the merge), important (likely bug, missing test on risky logic, breaks a repo rule), suggestion (an improvement the author may skip), info (a question). Few and real: no restating the diff, no praise, no nit a linter enforces.',
    '- Each finding has the file and the line of the new version it is about (a line the MR changed), `body`: what is wrong and why, with the evidence, and `comment`: the comment to post, written to the author, first person, two or three short sentences, precise about what is wrong and the direction of the fix, no code, no greeting, no dash used as a connector. A finding about no file (the description, the ticket) has no path and no line.',
    '',
    'Answer with only this JSON, in a ```json block (an empty "findings" is a fine answer):',
    '{"findings": [{"id": "short-kebab-id", "severity": "critical|important|suggestion|info", "title": "...", "path": "repo/relative/path", "line": 42, "body": "...", "comment": "..."}], "verified": "what you checked and found sound, one or two sentences"}',
  ].filter((l) => l !== '').join('\n');
}

const SEVERITIES = ['critical', 'important', 'suggestion', 'info'];

/** @param {string} answer */
export function parseChapter(answer) {
  const json = jsonAnswer(answer);
  if (!json.ok) return json;
  if (!Array.isArray(json.value.findings)) return { ok: false, error: '"findings" must be an array' };
  const findings = json.value.findings
    .filter((f) => f && text(f.title) && SEVERITIES.includes(f.severity))
    .map((f) => ({
      id: typeof f.id === 'string' && /^[a-z0-9-]{2,40}$/.test(f.id) ? f.id : null,
      severity: f.severity, title: text(f.title, 200), body: text(f.body, 6000) ?? text(f.title, 200),
      path: text(f.path, 300), line: Number.isInteger(f.line) && f.line > 0 ? f.line : null, comment: text(f.comment, 3000),
    }));
  return { ok: true, value: { findings, verified: text(json.value.verified, 800) ?? '' } };
}
