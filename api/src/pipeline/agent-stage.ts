import { CLAUDE_BIN } from '../config.ts';
import { claudeArgs, parseRunOutput } from '../claude-cli.ts';
import { runStreaming } from '../progress.ts';
import { runEnv } from '../run-settings.ts';

// One stage of a staged run: a single headless Claude call with a narrow job, the tools that job
// needs and a typed answer. Its steps show under the stage, its cost adds to the run's. An answer
// that does not fit the contract is sent back once, in the same session, with what was wrong.

const TIMEOUT_MS = 20 * 60_000;

/**
 * @template T
 * @param {{ run: any, stage: string, prompt: string, system: string, tools: string[], cwd: string,
 *   settings?: object | null, addDirs?: string[], parse: (text: string) => { ok: boolean, value?: T, error?: string } }} input
 * @returns {Promise<T>}
 */
export async function agentStage({ run, stage, prompt, system, tools, cwd, settings = null, addDirs = [], parse }) {
  const call = async (text, resume) => {
    const args = [...claudeArgs({ prompt: text, tools, systemPrompt: system, settings, resume }), ...addDirs.flatMap((d) => ['--add-dir', d])];
    const { stdout } = await runStreaming(
      CLAUDE_BIN, args, { cwd, timeout: TIMEOUT_MS, env: runEnv() },
      (step, info) => run.step(step, { ...info, stage }),
      (line) => run.event(line),
    );
    const out = parseRunOutput(stdout);
    if (out.stats) run.addCost(out.stats);
    return out;
  };
  let out = await call(prompt, null);
  let parsed = parse(out.text);
  if (parsed.ok) return /** @type {T} */ (parsed.value);
  if (out.sessionId) {
    run.step(`The answer did not fit the contract (${parsed.error}): asking again`, { stage });
    out = await call(`Your answer could not be used: ${parsed.error}. Answer again with only the JSON block, in the shape asked.`, out.sessionId);
    parsed = parse(out.text);
    if (parsed.ok) return /** @type {T} */ (parsed.value);
  }
  throw new Error(`The "${stage}" stage gave no usable answer: ${parsed.error}`);
}

// Runs `fn` on each item, at most `limit` at a time, keeping the order of the results.
/** @template I, R @param {I[]} items @param {number} limit @param {(item: I, index: number) => Promise<R>} fn @returns {Promise<R[]>} */
export async function mapLimit<I, R>(items: I[], limit: number, fn: (item: I, index: number) => Promise<R>): Promise<R[]> {
  const results: R[] = [];
  let next = 0;
  const worker = async () => {
    while (next < items.length) {
      const i = next++;
      results[i] = await fn(items[i], i);
    }
  };
  await Promise.all(Array.from({ length: Math.min(limit, items.length) }, worker));
  return results;
}
