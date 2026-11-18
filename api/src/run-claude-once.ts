import { CLAUDE_BIN } from './config.ts';
import { parseRunOutput } from './claude-cli.ts';
import { runStreaming } from './progress.ts';
import { runEnv } from './run-settings.ts';
import { appendRun } from './runlog.ts';

// One headless Claude run whose cost is logged: runs `args`, reads the output, and records the run's
// stats in the run log under `log`. Returns the final text and the stats (null when none came back).
export async function runClaudeOnce({ args, cwd, timeout, meta, log }: {
  args: string[];
  cwd: string;
  timeout: number;
  meta: { name: string; kind: string; project?: string };
  log: { project: any; iid: any; kind: string; command: string };
}) {
  const { stdout } = await runStreaming(CLAUDE_BIN, args, { cwd, timeout, env: runEnv() }, undefined, undefined, meta);
  const { text, stats } = parseRunOutput(stdout);
  if (stats) appendRun({ ...log, ...stats });
  return { text, stats };
}
