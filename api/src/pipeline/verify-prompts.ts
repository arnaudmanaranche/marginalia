// The verify stage, as its agent is asked (ADR 0009): try to reproduce one finding in the runner, and
// say what happened. Pure: tested on plain values. The agent reads the code, creates a throwaway test
// or script in the runner's copy with `write_file`, runs it with `run` and reports; it cannot change a
// file that exists, so it cannot make a finding come true.
import { jsonAnswer } from './json-answer.ts';
import { normalizeVerification } from '../finding-proof.ts';

export const VERIFY_SYSTEM = "You are checking one claim a reviewer made about a merge request, as one stage of Marginalia's review, by running the project. You only have these ways to run anything: the `run` tool (one step of the approved recipe, with arguments), `write_file` (a new file in a disposable copy of the project) and, when the recipe says where the project is served, `browse` (one browser step at a time on that copy). You cannot change an existing file and you must not try. Write everything in English. A reproduction proves or fails to prove the claim; it never edits the project's code to make it true.";

/** @param {{ steps: { purpose: string, run: string, summary: string }[], hosts?: string[], notes?: string }} recipe */
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

/** @param {{ context: string, finding: any, chapter: any, recipe: any }} input */
export function verifyPrompt({ context, finding, chapter, recipe }: { context: string; finding: any; chapter: any; recipe: any }) {
  return [
    'Your stage: try to reproduce this finding by running the project. The code is read from the checkout you are in; the copy where things run is separate and disposable.',
    '', context, '',
    `## The claim\n[${finding.severity}] ${finding.title}${finding.path ? ` (${finding.path}${finding.line ? `:${finding.line}` : ''})` : ''}\n${finding.body}`,
    chapter ? `\nThe chapter it belongs to: ${chapter.title}. ${chapter.summary}` : '',
    '', recipeText(recipe), '',
    '## How',
    '- Read the code the claim is about first. Decide the smallest thing that would show the claim true or false: an input, a call, a request.',
    '- Run a `setup` step only if what you need is not already there. Create a throwaway test or script with `write_file`, in the style and the place the repo\'s own tests use, then run it through the recipe\'s test (or run) step with that file as the argument.',
    '- Judge fairly: `reproduced` when what you observed is the wrong behaviour the claim describes, `not_reproduced` when a fair attempt shows the behaviour is correct, `inconclusive` when you could not run it (setup failed, no way to exercise it here, out of time). Never say reproduced from reading alone.',
    '- `evidence`: what you ran and what came out, in two to five sentences, quoting the decisive line of output. `command`: the one command that showed it.',
    '',
    'Answer with only this JSON, in a ```json block:',
    '{"status": "reproduced|not_reproduced|inconclusive", "evidence": "...", "command": "..."}',
  ].filter((l) => l !== '').join('\n');
}

/** @param {string} answer */
export function parseVerification(answer: any) {
  const json = jsonAnswer(answer);
  if (!json.ok) return json;
  const v = normalizeVerification(json.value);
  if (!v || v.status === 'skipped') return { ok: false, error: 'status must be reproduced, not_reproduced or inconclusive' };
  if (!v.evidence) return { ok: false, error: '"evidence" must say what you ran and what came out' };
  return { ok: true, value: v };
}
