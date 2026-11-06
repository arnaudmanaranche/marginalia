// The arguments of the docker commands a verification runs on (ADR 0009). Pure: no config, no
// I/O, so what the runner may and may not have is tested on plain values. Whatever the caller asks,
// the limits are always there, the root is read-only, no capability is kept and nothing of the bot
// (its data, its Claude login, its tokens) is mounted.
import { resolve, sep } from 'node:path';
import type { VerifyLimits } from './verify-limits.ts';

const WORK = '/work';

// The directory mounted in the runner is a copy of the MR's worktree: never a place the bot keeps
// something of its own, nor a parent of one.
export function assertSafeMount(workdir: string, forbidden: string[]) {
  const dir = resolve(workdir);
  for (const f of forbidden.filter(Boolean).map((p) => resolve(p))) {
    if (dir === f || dir.startsWith(f + sep) || f.startsWith(dir.endsWith(sep) ? dir : dir + sep)) throw new Error(`the runner may not mount ${dir}: it holds or is inside ${f}`);
  }
  return dir;
}

export interface RunnerInput {
  name: string;
  image: string;
  workdir: string;
  limits: VerifyLimits;
  // Who runs the commands: the owner of the copy, so it can write there.
  user: string;
  // A network only the egress proxy sits on, and that proxy, when the recipe names hosts.
  egress?: { network: string; proxy: string } | null;
  hosts?: string[];
  forbidden?: string[];
}

// `docker run` for a container that waits for commands (`docker exec`) and is removed when stopped.
export function runArgs(input: RunnerInput) {
  const { name, image, limits, user, egress = null, hosts = [], forbidden = [] } = input;
  const dir = assertSafeMount(input.workdir, forbidden);
  const net = egress && hosts.length ? ['--network', egress.network, ...proxyEnv(egress.proxy)] : ['--network', 'none'];
  return [
    'run', '-d', '--rm', '--name', name,
    '--read-only', '--tmpfs', '/tmp:rw,size=1g', '--tmpfs', '/home/runner:rw,size=512m',
    '--cap-drop', 'ALL', '--security-opt', 'no-new-privileges:true',
    '--user', user,
    '--cpus', String(limits.cpus), '--memory', `${limits.memoryMb}m`, '--memory-swap', `${limits.memoryMb}m`, '--pids-limit', String(limits.pids),
    ...net,
    '-e', 'HOME=/home/runner', '-e', 'CI=true',
    '-v', `${dir}:${WORK}:rw`, '-w', WORK,
    image, 'sleep', 'infinity',
  ];
}

function proxyEnv(proxy: string) {
  return ['HTTP_PROXY', 'HTTPS_PROXY', 'http_proxy', 'https_proxy'].flatMap((k) => ['-e', `${k}=${proxy}`]);
}

export const execArgs = (name: string, command: string) => ['exec', '-w', WORK, name, 'sh', '-c', command];
export const removeArgs = (name: string) => ['rm', '-f', name];

// A command may be a step of the approved recipe, with arguments after it (a file or a test name to
// run), and nothing that chains or redirects: the step is what a person approved.
const SHELL_SYNTAX = /[;&|`$<>(){}\n\\]/;

export function commandAllowed(steps: { run: string }[], command: string) {
  const c = String(command ?? '').trim();
  if (!c || SHELL_SYNTAX.test(c)) return false;
  return steps.some((s) => c === s.run.trim() || c.startsWith(`${s.run.trim()} `));
}

// What an agent reads of a command's output: the start, where a failure is announced, and the end,
// where a summary is, with the cut said.
export function truncateOutput(text: string, max = 8000) {
  if (text.length <= max) return text;
  const head = Math.floor(max / 4);
  return `${text.slice(0, head)}\n… ${text.length - max} characters left out …\n${text.slice(-(max - head))}`;
}
