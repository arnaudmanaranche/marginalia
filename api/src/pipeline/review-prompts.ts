// The staged review, as the agents are asked it: one agent maps the change (overview, risk,
// chapters), then one agent per chapter reviews it. Each answer is checked here before the next
// stage uses it. Pure: tested on plain values.
import { Severity } from '@worldia/marginalia-contract';
import { jsonAnswer, matchesPattern, text } from './json-answer.ts';
import { normalizeProof } from '../finding-proof.ts';
import { RISK_LEVELS, atLeastWorst, normalizeAxes, normalizeMitigations } from '../risk-axes.ts';
import { BUILT_IN_METHODS, fillMethod } from './stage-methods.ts';

export const REVIEW_SYSTEM = BUILT_IN_METHODS['review-system'];

// The method (stage-methods.ts) says how to work; the JSON asked for here is the contract and stays in code.
export function mapPrompt(context: any, method: string = BUILT_IN_METHODS['review-map']) {
  return [
    'Your stage: map the change, so the reviewers after you and the person reading the review grasp it without opening every file. Do not look for bugs yet.',
    '', context, '',
    fillMethod(method),
    '',
    'Answer with only this JSON, in a ```json block:',
    '{"overview": {"before": "...", "after": "..."}, "criticalPaths": ["..."], "risk": {"level": "low|medium|high", "rationale": "...", "factors": ["..."], "axes": [{"axis": "verification|alignment|impact|rollback|detection", "level": "low|medium|high", "note": "..."}], "mitigations": ["..."]}, "chapters": [{"title": "...", "summary": "...", "files": ["path or glob"], "check": "..."}]}',
  ].join('\n');
}


// The map, checked: every changed file lands in a chapter (the ones the agent left out go to a last
// one, said in `warnings`).
export function parseMap(answer: any, changed: any) {
  const json = jsonAnswer(answer);
  if (!json.ok) return json;
  const { overview, risk, chapters } = json.value;
  if (!text(overview?.before) || !text(overview?.after)) return { ok: false, error: 'overview needs "before" and "after"' };
  if (!RISK_LEVELS.includes(risk?.level)) return { ok: false, error: 'risk.level must be low, medium or high' };
  if (!Array.isArray(chapters) || !chapters.length) return { ok: false, error: '"chapters" must be a non-empty array' };
  const kept = chapters
    .map((c) => ({ title: text(c?.title, 200), summary: text(c?.summary, 1500) ?? '', check: text(c?.check, 1500) ?? '', files: (Array.isArray(c?.files) ? c.files : []).map((f: any) => text(f, 300)).filter(Boolean) }))
    .filter((c) => c.title && c.files.length)
    .slice(0, 12);
  if (!kept.length) return { ok: false, error: 'no chapter has a title and files' };
  const axes = normalizeAxes(risk.axes);
  const warnings: string[] = [];
  const left = changed.filter((p: any) => !kept.some((c) => c.files.some((f: any) => matchesPattern(f, p))));
  if (left.length) {
    kept.push({ title: 'The rest of the change', summary: 'Files the map did not place in a chapter.', check: 'Whatever these files change on their own.', files: left });
    warnings.push(`${left.length} changed file(s) were in no chapter of the map: reviewed in a last one`);
  }
  if (axes.length < 5) warnings.push('the risk was not judged on all five axes');
  return {
    ok: true,
    value: {
      overview: { before: text(overview.before, 600), after: text(overview.after, 600) },
      risk: { level: atLeastWorst(risk.level, axes), rationale: text(risk.rationale, 400) ?? '', factors: (Array.isArray(risk.factors) ? risk.factors : []).map((f: any) => text(f, 120)).filter(Boolean).slice(0, 8), axes, mitigations: normalizeMitigations(risk.mitigations) },
      criticalPaths: (Array.isArray(json.value.criticalPaths) ? json.value.criticalPaths : []).map((p: any) => text(p, 200)).filter(Boolean).slice(0, 12),
      chapters: kept,
      warnings,
    },
  };
}

// The axes the map found medium or high, so a reviewer looks hardest where the change is weakest.
const weakAxes = (risk: any) => {
  const weak = (risk.axes ?? []).filter((a: any) => a.level !== 'low');
  return weak.length ? `\nWeakest points of the change: ${weak.map((a: any) => `${a.axis} (${a.level}${a.note ? `: ${a.note}` : ''})`).join('; ')}. Weigh your files against them.` : '';
};

export function chapterPrompt({ context, map, chapter, index, checklist, method = BUILT_IN_METHODS['review-chapter'] }: any) {
  const others = map.chapters.map((c: any, i: any) => `${i + 1}. ${c.title}${i === index ? ' (yours)' : ''}`).join('\n');
  return [
    `Your stage: review chapter ${index + 1} of ${map.chapters.length}, "${chapter.title}". Other agents review the other chapters at the same time: stay on your files, read anything else only to understand them.`,
    '', context, '',
    `## The change, as mapped\nBefore: ${map.overview.before}\nAfter: ${map.overview.after}\nRisk: ${map.risk.level}, ${map.risk.rationale}${weakAxes(map.risk)}\n\nChapters:\n${others}`,
    '',
    `## Your chapter\n${chapter.summary}\nFiles: ${chapter.files.join(', ')}\nWhat to verify: ${chapter.check}`,
    '',
    ...fillMethod(method, { checklist }).split('\n'),
    '',
    'Answer with only this JSON, in a ```json block (an empty "findings" is a fine answer):',
    '{"findings": [{"id": "short-kebab-id", "severity": "critical|important|suggestion|info", "title": "...", "path": "repo/relative/path", "line": 42, "body": "...", "comment": "...", "proof": "runtime|static"}], "verified": "what you checked and found sound, one or two sentences"}',
  ].filter((l) => l !== '').join('\n');
}

export function parseChapter(answer: any) {
  const json = jsonAnswer(answer);
  if (!json.ok) return json;
  if (!Array.isArray(json.value.findings)) return { ok: false, error: '"findings" must be an array' };
  const findings = json.value.findings
    .filter((f: any) => f && text(f.title) && Severity.options.includes(f.severity))
    .map((f: any) => ({
      id: typeof f.id === 'string' && /^[a-z0-9-]{2,40}$/.test(f.id) ? f.id : null,
      severity: f.severity, title: text(f.title, 200), body: text(f.body, 6000) ?? text(f.title, 200),
      path: text(f.path, 300), line: Number.isInteger(f.line) && f.line > 0 ? f.line : null, comment: text(f.comment, 3000),
      proof: normalizeProof(f.proof) ?? 'static',
    }));
  return { ok: true, value: { findings, verified: text(json.value.verified, 800) ?? '' } };
}
