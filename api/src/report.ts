import { readFile, rm } from 'node:fs/promises';
import { join } from 'node:path';
import { FINDINGS_FILE, buildShape } from './findings.ts';

// Where the injected contract (run-contract.ts) asks the run to write its final report: a plain
// path in the worktree (a write under .claude/ is refused in headless runs).
export const REPORT_FILE = '.marginalia-report.md';

const REVIEW_FILE_BLOCK = /<<<REVIEW_FILE path="[^"]*">>>\n([\s\S]*?)\n<<<END_REVIEW_FILE>>>/;
const MIN_FALLBACK_CHARS = 200;
const TOOL_DENIED = /(?:tool|permission)[^\n]{0,80}(?:not allowed|denied|not permitted)|(?:not allowed|denied|not permitted)[^\n]{0,80}(?:tool|permission)/i;

export async function clearStaleReport(worktreeDir) {
  await Promise.all([REPORT_FILE, FINDINGS_FILE].map((f) => rm(join(worktreeDir, f), { force: true })));
}

// The structured findings the run wrote, or null. Consumed (removed) so the next
// run can't pick up a stale one.
export async function extractFindings(worktreeDir) {
  const path = join(worktreeDir, FINDINGS_FILE);
  try {
    const raw = await readFile(path, 'utf8');
    await rm(path, { force: true });
    return raw.trim() ? raw : null;
  } catch {
    return null;
  }
}

// Cascade: report file -> marker block on stdout -> raw stdout. Returns
// { content, source } where source is 'file' | 'block' | 'stdout', or throws
// with an actionable message.
export async function extractReport({ worktreeDir, stdout, stderr = '' }) {
  const reportPath = join(worktreeDir, REPORT_FILE);
  try {
    const content = await readFile(reportPath, 'utf8');
    await rm(reportPath, { force: true });
    if (content.trim()) return { content, source: 'file' };
  } catch {
    /* no report file */
  }

  const block = stdout.match(REVIEW_FILE_BLOCK);
  if (block) return { content: block[1], source: 'block' };

  const trimmed = stdout.trim();
  const denied = `${stdout}\n${stderr}`.match(TOOL_DENIED);
  if (denied) {
    throw new Error(`A tool was refused in headless mode ("${denied[0].trim()}"). Add it to CLAUDE_EXTRA_ALLOWED_TOOLS in .env.`);
  }
  if (trimmed.length >= MIN_FALLBACK_CHARS) {
    const banner = '> \u26a0\ufe0f **Non-standard output**: the command did not follow the bot contract, so this is its raw final message. It may be a summary rather than the full report.\n\n';
    return { content: `${banner}${trimmed}\n`, source: 'stdout' };
  }

  throw new Error(`The command produced no report (no ${REPORT_FILE}, no <<<REVIEW_FILE>>> block, stdout too short). Raw output: ${trimmed.slice(0, 500)}`);
}

// Everything the bot guarantees about a run's output, whatever the command that
// produced it: the markdown report, plus a normalized shape (see findings.ts)
// built from the findings file when there is one, from the report otherwise.
export async function buildReport({ worktreeDir, stdout, stderr = '' }) {
  const { content, source } = await extractReport({ worktreeDir, stdout, stderr });
  const findingsRaw = await extractFindings(worktreeDir);
  return { content, source, findingsRaw, shape: buildShape({ markdown: content, findingsRaw }) };
}
