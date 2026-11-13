// The side effects of the browse tool (ADR 0010): drive agent-browser in the runner and keep the
// evidence on the bot's side. What a step may be is decided in verify-browse.ts.
import { mkdir, writeFile } from 'node:fs/promises';
import { join } from 'node:path';
import { EVIDENCE_DIR, EVIDENCE_FILES, MAX_EVIDENCE_BYTES, browseStep, runStep } from './verify-browse.ts';
import type { Runner } from './verify-runner.ts';

// Chromium cannot start its own sandbox with every capability dropped: the container is the boundary.
const DRIVER = ['agent-browser', '--args', '--no-sandbox'];
const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms));

export interface Artifact { kind: 'screenshot' | 'log' | 'trace'; name: string }

export function browser({ runner, steps, hosts, evidenceDir }: { runner: () => Promise<Runner>; steps: { purpose: string; run: string }[]; hosts: string[]; evidenceDir: string | null }) {
  let started = false;
  const kept: Artifact[] = [];
  // The project is started once, by the recipe's own `run` step, the first time a page is opened.
  const startProject = async (r: Runner) => {
    const cmd = runStep(steps);
    if (!started && cmd) await r.start(cmd);
    started = true;
  };
  async function open(r: Runner, argv: string[]) {
    await startProject(r);
    let last = { code: 1, output: '' };
    for (let i = 0; i < 20; i++) {
      last = await r.argv([...DRIVER, ...argv]);
      if (last.code === 0) return last;
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
      const body = f.kind === 'screenshot' ? await r.read(f.argv[1], MAX_EVIDENCE_BYTES) : Buffer.from(out.output.slice(0, MAX_EVIDENCE_BYTES));
      if (!body || (f.kind === 'screenshot' && out.code !== 0) || body.length > MAX_EVIDENCE_BYTES) continue;
      await writeFile(join(evidenceDir, f.name), body);
      if (!kept.some((k) => k.name === f.name)) kept.push({ kind: f.kind, name: f.name });
      if (f.kind === 'log') seen.push(`${f.name}:\n${out.output.slice(0, 1500) || '(empty)'}`);
    }
    await writeFile(join(evidenceDir, 'evidence.json'), JSON.stringify(kept));
    return { code: 0, output: `Evidence kept: ${kept.map((k) => k.name).join(', ') || 'nothing'}.\n${seen.join('\n')}` };
  }
  return async (input: any) => {
    const step = browseStep(input, hosts);
    if (!step.ok) return { code: 126, output: '', refused: step.error };
    const r = await runner();
    if (input.action === 'evidence') return evidence(r);
    return input.action === 'open' ? open(r, step.argv) : r.argv([...DRIVER, ...step.argv]);
  };
}
