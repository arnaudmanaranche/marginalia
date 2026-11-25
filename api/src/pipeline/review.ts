import { STAGE_READ_TOOLS } from '../allowed-tools.ts';
import { agentStage } from './agent-stage.ts';
import { gatherContext } from './context.ts';
import { CHECKLIST, contextText } from './context-text.ts';
import { renderReview } from './report-render.ts';
import { mergeReview } from './review-merge.ts';
import { DATA_DIR, REVIEW_PROMPT_EXTRA } from '../config.ts';
import { lensPrompt } from '../catalog.ts';
import { assembleCatalog } from '../catalog-assemble.ts';
import { teamRunExtras } from '../team-claude.ts';
import { withTeamDeny } from '../team-plugin.ts';
import { readContext } from '../context-store.ts';
import { projectContextPrompt } from '../context-prompt.ts';
import { reviewVerifier } from './verify.ts';
import { isVerifyCandidate } from './verify-select.ts';
import { createLimiter } from './limiter.ts';
import { chapterPrompt, mapPrompt, parseChapter, parseMap } from './review-prompts.ts';
import { methodsLine, resolveMethods } from '../prompt-source.ts';

// A reproduction that broke is said, never silent: the blocking findings about behaviour it was to try come
// back inconclusive, and the report warns.
const unverified = (findings: any[], err: any) => {
  const why = String(err?.message ?? err).slice(0, 200);
  const mark = (f: any) => (isVerifyCandidate(f) && !f.verification ? { ...f, verification: { status: 'inconclusive', evidence: `Could not run: ${why}`, command: null } } : f);
  return { findings: findings.map(mark), warnings: [`verification failed: ${why}`] };
};

// Chapters reviewed side by side, at most this many at once.
const CONCURRENCY = 3;

// Marginalia's own review of someone else's MR, in stages a person can follow in the studio:
// the bot gathers the context, one agent maps the change into chapters, one agent per chapter
// reviews it, and the bot weighs the findings into the report. Returns the report and its
// findings, as the studio reads them.
export async function stagedReview({ mr, run, outputPath, stack = null, settings }: { mr: any; run: any; outputPath: string; stack?: any; settings: object | null }) {
  const cwd = mr.project.worktreeDir;
  await run.stage('context');
  const { context } = await gatherContext(mr, { outputPath, stack });
  run.step(`${context.files.length} changed files${context.ticket ? `, ticket ${context.ticket.key}${context.ticket.text ? '' : ' (not readable here)'}` : ', no ticket'}, rules in ${context.guidance.join(', ') || 'no file'}`, { stage: 'context' });
  // REVIEW_PROMPT_EXTRA: what the dev (or the team) asks of every review, for every stage.
  const extra = REVIEW_PROMPT_EXTRA.trim() ? `What the team asks of every review:\n${REVIEW_PROMPT_EXTRA.trim()}` : '';
  const approved = await readContext(DATA_DIR, mr.project.key, 'approved');
  const text = [contextText(context), projectContextPrompt(approved), extra].filter(Boolean).join('\n\n');
  // One version of each stage method for the whole run, the verifications included (ADR 0014).
  const methods = await resolveMethods(['review-system', 'review-map', 'review-chapter', 'verify-system', 'verify-method']);
  run.step(methodsLine(Object.values(methods)), { stage: 'context' });
  const system = methods['review-system'];

  await run.stage('map');
  const changed = context.files.map((f: any) => f.path);
  const map = await agentStage({ run, stage: 'map', prompt: mapPrompt(text, methods['review-map'].text), system: system.text, methods: [methods['review-map'], system], tools: STAGE_READ_TOOLS, cwd, settings, parse: (t: string) => parseMap(t, changed) });
  const ids = map.chapters.map((_: any, i: number) => `chapter-${i + 1}`);
  await run.plan('map', map.chapters.map((c: any, i: number) => [ids[i], `Review: ${c.title}`]));
  await run.end('map');

  const checklist = context.guidance.includes(CHECKLIST) ? CHECKLIST : null;
  // Each chapter's reviewer may load the review lenses (built-in and team skills) its files call
  // for; both plugins stay read-only to it.
  const catalog = await assembleCatalog(DATA_DIR);
  const team = await teamRunExtras(DATA_DIR);
  const lens = { methods: [methods['review-chapter'], system], system: [system.text, lensPrompt(catalog.skills)].filter(Boolean).join('\n\n'), tools: [...STAGE_READ_TOOLS, 'Skill'], settings: withTeamDeny(settings, { deny: [...team.deny, ...catalog.deny] }), extraArgs: [...team.args, ...catalog.args] };
  // Each chapter's blocking findings about behaviour are reproduced as soon as it is reviewed, while the
  // other chapters are still being read (ADR 0009, 0010).
  const verify = reviewVerifier({ run, mr, recipe: approved?.context.verification ?? null, context: text, settings, methods: [methods['verify-method'], methods['verify-system']] });
  const limit = createLimiter(CONCURRENCY);
  const reviewed = await Promise.all(map.chapters.map((chapter: any, i: number) => limit(async () => {
    await run.begin(ids[i]);
    try {
      const result = await agentStage({ run, stage: ids[i], prompt: chapterPrompt({ context: text, map, chapter, index: i, checklist, method: methods['review-chapter'].text }), ...lens, cwd, parse: parseChapter });
      await run.found(ids[i], result.findings ?? []);
      await run.end(ids[i]);
      const verifying = verify({ after: ids[i], chapter: map.chapters[i], findings: result.findings ?? [] }).catch((err) => unverified(result.findings ?? [], err));
      return { result, verifying };
    } catch (err) {
      await run.end(ids[i], 'failed');
      run.step(`This chapter could not be reviewed: ${String(err.message).slice(0, 200)}`, { stage: ids[i] });
      return { result: null, error: String(err.message).slice(0, 200), verifying: null };
    }
  })));
  const verifiedWarnings = new Set<string>();
  const chapters = await Promise.all(reviewed.map(async (c: any) => {
    if (!c.verifying) return c;
    const v = await c.verifying;
    v.warnings.forEach((w: string) => verifiedWarnings.add(w));
    return { ...c, result: { ...c.result, findings: v.findings } };
  }));
  if (chapters.every((c) => !c.result)) throw new Error(`No chapter could be reviewed: ${chapters[0].error}`);

  const merged = mergeReview({ map, chapters, methods: Object.fromEntries(Object.values(methods).map((m) => [m.name, m.version])) });
  await run.stage('report');
  const data = merged.data;
  return { content: renderReview({ title: mr.title, iid: mr.iid, branch: mr.source_branch }, data), findingsRaw: JSON.stringify(data), warnings: [...merged.warnings, ...verifiedWarnings] };
}
