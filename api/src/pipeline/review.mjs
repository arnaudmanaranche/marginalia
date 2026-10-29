// @ts-check
import { STAGE_READ_TOOLS } from '../allowed-tools.mjs';
import { agentStage, mapLimit } from './agent-stage.mjs';
import { gatherContext } from './context.mjs';
import { contextText } from './context-text.mjs';
import { renderReview } from './report-render.mjs';
import { mergeReview } from './review-merge.mjs';
import { REVIEW_SYSTEM, chapterPrompt, mapPrompt, parseChapter, parseMap } from './review-prompts.mjs';

// Chapters reviewed side by side, at most this many at once.
const CONCURRENCY = 3;
const CHECKLIST = '.claude/agents/code-reviewer.md';

// Marginalia's own review of someone else's MR, in stages a person can follow in the studio:
// the bot gathers the context, one agent maps the change into chapters, one agent per chapter
// reviews it, and the bot weighs the findings into the report. Returns the report and its
// findings file, as a review command would have written them.
/** @param {{ mr: any, run: any, outputPath: string, stack?: any, settings: object | null }} input */
export async function stagedReview({ mr, run, outputPath, stack = null, settings }) {
  const cwd = mr.project.worktreeDir;
  await run.stage('context');
  const { context } = await gatherContext(mr, { outputPath, stack });
  run.step(`${context.files.length} changed files${context.ticket ? `, ticket ${context.ticket.key}${context.ticket.text ? '' : ' (not readable here)'}` : ', no ticket'}, rules in ${context.guidance.join(', ') || 'no file'}`, { stage: 'context' });
  const text = contextText(context);

  await run.stage('map');
  const changed = context.files.map((f) => f.path);
  const map = await agentStage({ run, stage: 'map', prompt: mapPrompt(text), system: REVIEW_SYSTEM, tools: STAGE_READ_TOOLS, cwd, settings, parse: (t) => parseMap(t, changed) });
  const ids = map.chapters.map((_, i) => `chapter-${i + 1}`);
  await run.plan('map', map.chapters.map((c, i) => [ids[i], `Review: ${c.title}`]));
  await run.end('map');

  const checklist = context.guidance.includes(CHECKLIST) ? CHECKLIST : null;
  const chapters = await mapLimit(map.chapters, CONCURRENCY, async (chapter, i) => {
    await run.begin(ids[i]);
    try {
      const result = await agentStage({ run, stage: ids[i], prompt: chapterPrompt({ context: text, map, chapter, index: i, checklist }), system: REVIEW_SYSTEM, tools: STAGE_READ_TOOLS, cwd, settings, parse: parseChapter });
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
