import { STAGE_READ_TOOLS } from '../allowed-tools.ts';
import { agentStage, mapLimit } from './agent-stage.ts';
import { gatherContext } from './context.ts';
import { contextText } from './context-text.ts';
import { renderReview } from './report-render.ts';
import { mergeReview } from './review-merge.ts';
import { DATA_DIR, REVIEW_PROMPT_EXTRA } from '../config.ts';
import { lensPrompt } from '../catalog.ts';
import { assembleCatalog } from '../catalog-assemble.ts';
import { teamRunExtras } from '../team-claude.ts';
import { withTeamDeny } from '../team-plugin.ts';
import { readContext } from '../context-store.ts';
import { projectContextPrompt } from '../context-prompt.ts';
import { REVIEW_SYSTEM, chapterPrompt, mapPrompt, parseChapter, parseMap } from './review-prompts.ts';

// Chapters reviewed side by side, at most this many at once.
const CONCURRENCY = 3;
const CHECKLIST = '.claude/agents/code-reviewer.md';

// Marginalia's own review of someone else's MR, in stages a person can follow in the studio:
// the bot gathers the context, one agent maps the change into chapters, one agent per chapter
// reviews it, and the bot weighs the findings into the report. Returns the report and its
// findings, as the studio reads them.
/** @param {{ mr: any, run: any, outputPath: string, stack?: any, settings: object | null }} input */
export async function stagedReview({ mr, run, outputPath, stack = null, settings }: { mr: any; run: any; outputPath: string; stack?: any; settings: object | null }) {
  const cwd = mr.project.worktreeDir;
  await run.stage('context');
  const { context } = await gatherContext(mr, { outputPath, stack });
  run.step(`${context.files.length} changed files${context.ticket ? `, ticket ${context.ticket.key}${context.ticket.text ? '' : ' (not readable here)'}` : ', no ticket'}, rules in ${context.guidance.join(', ') || 'no file'}`, { stage: 'context' });
  // REVIEW_PROMPT_EXTRA: what the dev (or the team) asks of every review, for every stage.
  const extra = REVIEW_PROMPT_EXTRA.trim() ? `What the team asks of every review:\n${REVIEW_PROMPT_EXTRA.trim()}` : '';
  const text = [contextText(context), projectContextPrompt(await readContext(DATA_DIR, mr.project.key, 'approved')), extra].filter(Boolean).join('\n\n');

  await run.stage('map');
  const changed = context.files.map((f: any) => f.path);
  const map = await agentStage({ run, stage: 'map', prompt: mapPrompt(text), system: REVIEW_SYSTEM, tools: STAGE_READ_TOOLS, cwd, settings, parse: (t: string) => parseMap(t, changed) });
  const ids = map.chapters.map((_: any, i: number) => `chapter-${i + 1}`);
  await run.plan('map', map.chapters.map((c: any, i: number) => [ids[i], `Review: ${c.title}`]));
  await run.end('map');

  const checklist = context.guidance.includes(CHECKLIST) ? CHECKLIST : null;
  // Each chapter's reviewer may load the review lenses (built-in and team skills) its files call
  // for; both plugins stay read-only to it.
  const catalog = await assembleCatalog(DATA_DIR);
  const team = await teamRunExtras(DATA_DIR);
  const lens = { system: [REVIEW_SYSTEM, lensPrompt(catalog.skills)].filter(Boolean).join('\n\n'), tools: [...STAGE_READ_TOOLS, 'Skill'], settings: withTeamDeny(settings, { deny: [...team.deny, ...catalog.deny] }), extraArgs: [...team.args, ...catalog.args] };
  const chapters = await mapLimit(map.chapters, CONCURRENCY, async (chapter, i) => {
    await run.begin(ids[i]);
    try {
      const result = await agentStage({ run, stage: ids[i], prompt: chapterPrompt({ context: text, map, chapter, index: i, checklist }), ...lens, cwd, parse: parseChapter });
      await run.found(ids[i], result.findings ?? []);
      await run.end(ids[i]);
      return { result };
    } catch (err) {
      await run.end(ids[i], 'failed');
      run.step(`This chapter could not be reviewed: ${String(err.message).slice(0, 200)}`, { stage: ids[i] });
      return { result: null, error: String(err.message).slice(0, 200) };
    }
  });
  if (chapters.every((c) => !c.result)) throw new Error(`No chapter could be reviewed: ${chapters[0].error}`);

  await run.stage('report');
  const { data, warnings } = mergeReview({ map, chapters });
  return { content: renderReview({ title: mr.title, iid: mr.iid, branch: mr.source_branch }, data), findingsRaw: JSON.stringify(data), warnings };
}
