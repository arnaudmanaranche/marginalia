import { buildShape } from '../findings.ts';
import { runSettings } from '../run-settings.ts';
import { stagedReview } from './review.ts';
import { stagedTriage } from './triage.ts';

// REVIEW_COMMAND / TRIAGE_COMMAND set to this run Marginalia's own staged pipelines instead of a
// slash command of the reviewed repo.
export const BUILTIN_COMMAND = 'marginalia';
/** @param {string} command */
export const isStaged = (command) => command.trim() === BUILTIN_COMMAND;

// A staged run, giving the same report a command's run would: its markdown, and its shape built
// from the findings file the stages wrote (plus what they warn about).
/** @param {{ mr: any, run: any, kind: 'review' | 'triage', outputPath: string, stack?: any }} input */
export async function stagedRun({ mr, run, kind, outputPath, stack = null }) {
  const settings = runSettings(mr.project);
  const out = kind === 'review'
    ? await stagedReview({ mr, run, outputPath, stack, settings })
    : await stagedTriage({ mr, run, settings });
  const shape = buildShape({ markdown: out.content, findingsRaw: out.findingsRaw });
  shape.warnings.push(...out.warnings);
  return { content: out.content, source: 'pipeline', shape };
}
