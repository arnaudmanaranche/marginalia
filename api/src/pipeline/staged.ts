import { buildShape } from '../findings.ts';
import { runSettings } from '../run-settings.ts';
import { enforceContract } from '../guardrail.ts';
import { stagedReview } from './review.ts';
import { stagedTriage } from './triage.ts';

// The name a run of the staged pipelines is recorded under (the run journal's `command`).
export const PIPELINE = 'marginalia';

// A staged run: the report's markdown, and its shape built from the findings the stages gave (plus
// what they warn about).
/** @param {{ mr: any, run: any, kind: 'review' | 'triage', outputPath: string, stack?: any }} input */
export async function stagedRun({ mr, run, kind, outputPath, stack = null as any }: { mr: any; run: any; kind: 'review' | 'triage'; outputPath: string; stack?: any }) {
  const settings = runSettings(mr.project);
  const out = kind === 'review'
    ? await stagedReview({ mr, run, outputPath, stack, settings })
    : await stagedTriage({ mr, run, settings });
  enforceContract(kind, out.findingsRaw ?? null);
  const shape = buildShape({ markdown: out.content, findingsRaw: out.findingsRaw });
  shape.warnings.push(...out.warnings);
  return { content: out.content, source: 'pipeline', shape };
}
