// A disposable runner (ADR 0009): a container started for one verification, commands run in it one
// at a time, removed at the end or when its time is up. The agent never runs code itself: it goes
// through exec(). Side effects only; what the container may have is decided in verify-runner-args.ts.
import { randomUUID } from 'node:crypto';
import { DOCKER_BIN, VERIFY_EGRESS_NETWORK, VERIFY_EGRESS_PROXY } from './config.ts';
import { execFileAsync } from './exec.ts';
import { commandAllowed, execArgs, removeArgs, runArgs, truncateOutput } from './verify-runner-args.ts';
import type { VerifyLimits } from './verify-limits.ts';

export interface Runner {
  exec: (command: string) => Promise<{ code: number; output: string; timedOut: boolean; refused?: string }>;
  stop: () => Promise<void>;
}

/** @param {{ image: string, workdir: string, limits: VerifyLimits, steps: { run: string }[], hosts?: string[], forbidden?: string[], docker?: string }} input */
export async function startRunner({ image, workdir, limits, steps, hosts = [], forbidden = [], docker = DOCKER_BIN }: { image: string; workdir: string; limits: VerifyLimits; steps: { run: string }[]; hosts?: string[]; forbidden?: string[]; docker?: string }): Promise<Runner> {
  if (!image) throw new Error('no runner image: set VERIFY_RUNNER_IMAGE');
  const name = `marginalia-verify-${randomUUID().slice(0, 8)}`;
  const egress = VERIFY_EGRESS_NETWORK && VERIFY_EGRESS_PROXY ? { network: VERIFY_EGRESS_NETWORK, proxy: VERIFY_EGRESS_PROXY } : null;
  const user = `${process.getuid?.() ?? 1000}:${process.getgid?.() ?? 1000}`;
  await execFileAsync(docker, runArgs({ name, image, workdir, limits, user, egress, hosts, forbidden }), { timeout: 60_000 });
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
