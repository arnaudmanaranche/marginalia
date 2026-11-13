// The side effects of the browse tool (ADR 0010): drive agent-browser in the runner and keep the
// evidence on the bot's side. What a step may be is decided in verify-browse.ts.
import { mkdir, writeFile } from 'node:fs/promises';
import { join } from 'node:path';
import { EVIDENCE_DIR, EVIDENCE_FILES, MAX_EVIDENCE_BYTES, NOT_LISTENING, browseStep, runStep } from './verify-browse.ts';
import { truncateOutput } from './verify-runner-args.ts';
import type { Runner } from './verify-runner.ts';

// Chromium cannot start its own sandbox with every capability dropped: the container is the boundary.
const DRIVER = ['agent-browser', '--args', '--no-sandbox'];
const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms));

export interface Artifact { kind: 'screenshot' | 'log'; name: string }

export function browser({ runner, steps, hosts, evidenceDir }: { runner: () => Promise<Runner>; steps: { purpose: string; run: string }[]; hosts: string[]; evidenceDir: string | null }) {
  let starting: Promise<void> | null = null;
  const kept: Artifact[] = [];
  // The project is started once, by the recipe's own `run` step, the first time a page is opened, however
  // many calls ask at once.
  const startProject = (r: Runner) => (starting ??= (async () => { const cmd = runStep(steps); if (cmd) await r.start(cmd); })());
  // Retried while the project is still starting (nothing listens yet), never for a page that fails otherwise.
  async function open(r: Runner, argv: string[]) {
    await startProject(r);
    let last: { code: number; output: string; timedOut?: boolean } = { code: 1, output: '' };
    for (let i = 0; i < 20; i++) {
      last = await r.argv([...DRIVER, ...argv]);
      if (last.code === 0 || last.timedOut || !NOT_LISTENING.test(last.output)) break;
      await sleep(1000);
    }
    return last;
  }
  async function evidence(r: Runner) {
    if (!evidenceDir) return { code: 1, output: 'no place to keep evidence' };
    await mkdir(evidenceDir, { recursive: true });
    await r.argv(['mkdir', '-p', EVIDENCE_DIR]);
    const seen: string[] = [];
    for (const f of EVIDENCE_FILES) {
      const out = await r.argv([...DRIVER, ...f.argv]);
      // A command that failed or ran out of time has nothing to keep: what an earlier call kept stays.
      if (out.code !== 0) continue;
      const body = f.file ? await r.read(f.file, MAX_EVIDENCE_BYTES) : Buffer.from(out.output);
      if (!body) continue;
      // A picture cut short is no picture: only a log is cut to the cap.
      if (f.file && body.length >= MAX_EVIDENCE_BYTES) continue;
      await writeFile(join(evidenceDir, f.name), body.subarray(0, MAX_EVIDENCE_BYTES));
      if (!kept.some((k) => k.name === f.name)) kept.push({ kind: f.kind, name: f.name });
      if (f.kind === 'log') seen.push(`${f.name}:\n${out.output.slice(0, 1500) || '(empty)'}`);
    }
    await writeFile(join(evidenceDir, 'evidence.json'), JSON.stringify(kept));
    return { code: 0, output: `Evidence kept: ${kept.map((k) => k.name).join(', ') || 'nothing'}.\n${seen.join('\n')}` };
  }
  const forAgent = (r: { code: number; output: string; timedOut?: boolean }) => ({ ...r, output: truncateOutput(r.output) });
  return async (input: any) => {
    const step = browseStep(input, hosts);
    if (!step.ok) return { code: 126, output: '', refused: step.error };
    const r = await runner();
    if (input.action === 'evidence') return evidence(r);
    return forAgent(input.action === 'open' ? await open(r, step.argv) : await r.argv([...DRIVER, ...step.argv]));
  };
}
