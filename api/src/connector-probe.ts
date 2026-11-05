import { CLAUDE_BIN } from './config.ts';
import { connectorChecks } from './connector-checks.ts';
import { execFileAsync } from './exec.ts';
import { runEnv } from './run-settings.ts';

// `claude mcp list` checks every server's health, which takes seconds, so its answer is kept for an
// hour: the preflight of each run reuses it rather than paying for it again.
const TTL_MS = 60 * 60_000;
const TIMEOUT_MS = 45_000;
let cached: { at: number; checks: Promise<ReturnType<typeof connectorChecks>> } | null = null;

const listConnectors = () => execFileAsync(CLAUDE_BIN, ['mcp', 'list'], { timeout: TIMEOUT_MS, env: runEnv() })
  .then((r: any) => connectorChecks({ stdout: String(r.stdout) }),
    (err: any) => connectorChecks({ stdout: String(err.stdout ?? ''), error: String(err.stderr || err.message || err) }));

export function probeConnectors(now = Date.now()) {
  if (!cached || now - cached.at > TTL_MS) cached = { at: now, checks: listConnectors() };
  return cached.checks;
}
