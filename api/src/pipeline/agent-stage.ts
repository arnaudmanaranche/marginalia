import { CLAUDE_BIN } from '../config.ts';
import { claudeArgs, parseRunOutput } from '../claude-cli.ts';
import { runStreaming } from '../progress.ts';
import { runEnv } from '../run-settings.ts';

// One stage of a staged run: a single headless Claude call with a narrow job, the tools that job
// needs and a typed answer. Its steps show under the stage, its cost adds to the run's. An answer
// that does not fit the contract is sent back once, in the same session, with what was wrong.

const TIMEOUT_MS = 20 * 60_000;

export async function agentStage<T = any>({ run, stage, prompt, system, tools, cwd, settings = null, addDirs = [], extraArgs = [], parse }: { run: any; stage: string; prompt: string; system: string; tools: string[]; cwd: string; settings?: object | null; addDirs?: string[]; extraArgs?: string[]; parse: (text: string) => { ok: boolean; value?: T; error?: string } }): Promise<T> {
  const call = async (text: string, resume: string | null) => {
    const args = [...claudeArgs({ prompt: text, tools, systemPrompt: system, settings, resume }), ...addDirs.flatMap((d) => ['--add-dir', d]), ...extraArgs];
    const { stdout, model } = await runStreaming(
      CLAUDE_BIN, args, { cwd, timeout: TIMEOUT_MS, env: runEnv() },
      (step, info) => run.step(step, { ...info, stage }),
      (line) => run.event(line),
      { name: stage, traceId: run.id, kind: run.kind, project: run.project },
      (c) => run.call(c, stage),
    );
    const out = parseRunOutput(stdout);
    if (out.stats) run.addCost({ ...out.stats, model }, stage);
    return out;
  };
  let out = await call(prompt, null);
  let parsed = parse(out.text);
  if (parsed.ok) return parsed.value as T;
  if (out.sessionId) {
    run.step(`The answer did not fit the contract (${parsed.error}): asking again`, { stage });
    out = await call(`Your answer could not be used: ${parsed.error}. Answer again with only the JSON block, in the shape asked.`, out.sessionId);
    parsed = parse(out.text);
    if (parsed.ok) return parsed.value as T;
  }
  throw new Error(`The "${stage}" stage gave no usable answer: ${parsed.error}`);
}
