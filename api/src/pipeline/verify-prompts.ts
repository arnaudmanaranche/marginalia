// The verify stage, as its agent is asked (ADR 0009): try to reproduce one finding in the runner, and
// say what happened. Pure: tested on plain values. The agent reads the code, creates a throwaway test
// or script in the runner's copy with `write_file`, runs it with `run` and reports; it cannot change a
// file that exists, so it cannot make a finding come true.
import { jsonAnswer } from './json-answer.ts';
import { normalizeVerification } from '../finding-proof.ts';
import { BUILT_IN_METHODS, fillMethod } from './stage-methods.ts';

export const VERIFY_SYSTEM = BUILT_IN_METHODS['verify-system'];

export function recipeText(recipe: any) {
  const steps = recipe.steps.map((s: any) => `- ${s.purpose}: \`${s.run}\` (${s.summary})`).join('\n');
  return [
    'The approved recipe: the only commands `run` accepts, from the project root, each optionally followed by arguments (a file or a test name) and never chained:',
    steps,
    recipe.hosts?.length ? `The network reaches only: ${recipe.hosts.join(', ')}.` : 'There is no network: anything that needs to download will fail.',
    recipe.notes ? `Notes: ${recipe.notes}` : '',
    recipe.browser ? `The project can be looked at in a browser with the \`browse\` tool: it starts the project with the recipe's run step and the page is at ${recipe.browser.url}${recipe.browser.ready ? ` (ready when ${recipe.browser.ready} answers)` : ''}. Use it for a claim about what a user sees or does: open the page, snapshot it, click and fill like the user, and when the page shows the claim true or false call \`evidence\` once (it keeps a screenshot, the console, page errors and the requests the page made for the person) and quote the decisive line in your evidence.` : '',
  ].filter(Boolean).join('\n');
}

export function verifyPrompt({ context, finding, chapter, recipe, method = BUILT_IN_METHODS['verify-method'] }: { context: string; finding: any; chapter: any; recipe: any; method?: string }) {
  return [
    'Your stage: try to reproduce this finding by running the project. The code is read from the checkout you are in; the copy where things run is separate and disposable.',
    '', context, '',
    `## The claim\n[${finding.severity}] ${finding.title}${finding.path ? ` (${finding.path}${finding.line ? `:${finding.line}` : ''})` : ''}\n${finding.body}`,
    chapter ? `\nThe chapter it belongs to: ${chapter.title}. ${chapter.summary}` : '',
    '', recipeText(recipe), '',
    fillMethod(method),
    '',
    'Answer with only this JSON, in a ```json block:',
    '{"status": "reproduced|not_reproduced|inconclusive", "evidence": "...", "command": "..."}',
  ].filter((l) => l !== '').join('\n');
}

export function parseVerification(answer: any) {
  const json = jsonAnswer(answer);
  if (!json.ok) return json;
  const v = normalizeVerification(json.value);
  if (!v || v.status === 'skipped') return { ok: false, error: 'status must be reproduced, not_reproduced or inconclusive' };
  if (!v.evidence) return { ok: false, error: '"evidence" must say what you ran and what came out' };
  return { ok: true, value: v };
}
