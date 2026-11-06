// What one verification may use (ADR 0009): the defaults, and a project's own override on top.
// Always a number for each limit: a runner never starts without them. Pure.

export const DEFAULT_LIMITS = { cpus: 2, memoryMb: 4096, pids: 256, timeoutMinutes: 10 };

export type VerifyLimits = typeof DEFAULT_LIMITS;

export function verifyLimits(project: { verifyLimits?: Partial<VerifyLimits> | null } | null | undefined): VerifyLimits {
  const own = project?.verifyLimits ?? {};
  const pick = <K extends keyof VerifyLimits>(key: K) => (typeof own[key] === 'number' && own[key]! > 0 ? own[key]! : DEFAULT_LIMITS[key]);
  return { cpus: pick('cpus'), memoryMb: pick('memoryMb'), pids: pick('pids'), timeoutMinutes: pick('timeoutMinutes') };
}
