// A disposable runner (ADR 0009): a container started for one verification, commands run in it one
// at a time, removed at the end or when its time is up. The agent never runs code itself: it goes
// through exec(). Side effects only; what the container may have is decided in verify-runner-args.ts.
import { randomUUID } from 'node:crypto';
import { execFileAsync } from './exec.ts';
import { commandAllowed, execArgs, execArgv, removeArgs, startArgs, runArgs, truncateOutput } from './verify-runner-args.ts';
import type { VerifyLimits } from './verify-limits.ts';

export interface Runner {
  exec: (command: string) => Promise<{ code: number; output: string; timedOut: boolean; refused?: string }>;
  // The browse tool's side (ADR 0010): a program without a shell, a recipe step left running, a file read back.
  argv: (argv: string[]) => Promise<{ code: number; output: string }>;
  start: (command: string) => Promise<void>;
  read: (path: string, maxBytes: number) => Promise<Buffer | null>;
  stop: () => Promise<void>;
}

// No config import: the runner is also started by the verify tool server (bin/verify-mcp.ts), a
// process of its own, so everything it needs is handed to it.
export interface RunnerOptions { image: string; workdir: string; limits: VerifyLimits; steps: { run: string }[]; hosts?: string[]; forbidden?: string[]; docker?: string; egress?: { network: string; proxy: string } | null; work?: { volume: string; subpath: string } | null }

export async function startRunner({ image, workdir, limits, steps, hosts = [], forbidden = [], docker = 'docker', egress = null, work = null }: RunnerOptions): Promise<Runner> {
  if (!image) throw new Error('no runner image: set VERIFY_RUNNER_IMAGE');
  const name = `marginalia-verify-${randomUUID().slice(0, 8)}`;
  const user = `${process.getuid?.() ?? 1000}:${process.getgid?.() ?? 1000}`;
  await execFileAsync(docker, runArgs({ name, image, workdir, limits, user, egress, hosts, forbidden, work }), { timeout: 60_000 });
  const deadline = Date.now() + limits.timeoutMinutes * 60_000;
  let removal: Promise<void> | null = null;
  // Stopping twice (the time is up while a command ends) waits for the same removal.
  const stop = () => {
    clearTimeout(timer);
    removal ??= execFileAsync(docker, removeArgs(name), { timeout: 30_000 }).then(() => {}, () => {});
    return removal;
  };
  // The whole verification has one budget of time: when it is up the container is removed, which
  // ends whatever still runs in it.
  const timer = setTimeout(() => { void stop(); }, limits.timeoutMinutes * 60_000);
  timer.unref?.();
  return {
    stop,
    async argv(argv) {
      const left = deadline - Date.now();
      if (removal || left <= 0) return { code: 124, output: 'out of time' };
      try {
        const { stdout, stderr } = await execFileAsync(docker, execArgv(name, argv), { timeout: Math.min(left, 60_000), maxBuffer: 4_000_000 });
        return { code: 0, output: truncateOutput(`${stdout}${stderr}`) };
      } catch (err: any) {
        return { code: typeof err.code === 'number' ? err.code : 1, output: truncateOutput(`${err.stdout ?? ''}${err.stderr ?? ''}`) };
      }
    },
    async start(command) { await execFileAsync(docker, startArgs(name, command), { timeout: 30_000 }); },
    async read(path, maxBytes) {
      try {
        const { stdout } = await execFileAsync(docker, execArgv(name, ['base64', path]), { timeout: 30_000, maxBuffer: maxBytes * 2 });
        return Buffer.from(stdout, 'base64');
      } catch { return null; }
    },
    async exec(command) {
      if (!commandAllowed(steps, command)) return { code: 126, output: '', timedOut: false, refused: 'not a step of the approved recipe (or it chains commands)' };
      const left = deadline - Date.now();
      if (removal || left <= 0) return { code: 124, output: '', timedOut: true };
      try {
        const { stdout, stderr } = await execFileAsync(docker, execArgs(name, command), { timeout: left, maxBuffer: 8_000_000 });
        return { code: 0, output: truncateOutput(`${stdout}${stderr}`), timedOut: false };
      } catch (err: any) {
        const timedOut = Boolean(err.killed) || err.signal === 'SIGTERM';
        if (timedOut) await stop();
        return { code: typeof err.code === 'number' ? err.code : 1, output: truncateOutput(`${err.stdout ?? ''}${err.stderr ?? ''}`), timedOut };
      }
    },
  };
}
