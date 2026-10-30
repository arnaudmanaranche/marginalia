// `marginalia service install|uninstall|status`: starts the bot at login with launchd
// (macOS) or a systemd user unit (Linux); elsewhere prints the pm2 instructions.
// Every side effect goes through the context built here, so `dryRun` (and `dir`, where
// the unit/plist files are written instead of the real place) can exercise the whole
// flow without registering anything on the machine.
import { PACKAGE_ROOT } from '../src/package-root.ts';
import { existsSync, mkdirSync, unlinkSync, writeFileSync } from 'node:fs';
import { homedir, userInfo } from 'node:os';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { execFileSync } from 'node:child_process';
import { manualInstructions, servicePlatform } from '../src/service-units.ts';
import { installLaunchd, uninstallLaunchd, statusLaunchd } from './service-launchd.ts';
import { installSystemd, uninstallSystemd, statusSystemd } from './service-systemd.ts';

const ROOT = PACKAGE_ROOT;
const sleep = (ms: number) => Atomics.wait(new Int32Array(new SharedArrayBuffer(4)), 0, 0, ms);

export function makeContext({ platform = process.platform, dryRun = false, dir, log = console.log, warn = console.warn, env = process.env }: { platform?: NodeJS.Platform; dryRun?: boolean; dir?: string; log?: (msg: string) => void; warn?: (msg: string) => void; env?: NodeJS.ProcessEnv } = {}) {
  const home = env.HOME || homedir();
  const swiftbarApp = () => ['/Applications', join(home, 'Applications')].map((d) => join(d, 'SwiftBar.app')).find((a) => existsSync(a));
  const dry = (what: string) => log(`[dry-run] ${what}`);
  return {
    platform, home, dir, log, warn,
    root: ROOT,
    nodePath: process.execPath,
    path: env.PATH ?? '/usr/bin:/bin',
    uid: userInfo().uid,
    xdgConfig: env.XDG_CONFIG_HOME,
    unitEnv: env.MARGINALIA_HOME ? { MARGINALIA_HOME: env.MARGINALIA_HOME } : {},
    exists: existsSync,
    swiftbarApp,
    sleep: dryRun ? () => {} : sleep,
    mkdir: (p: string) => (dryRun && !dir ? dry(`mkdir ${p}`) : mkdirSync(p, { recursive: true })),
    exec: dryRun
      ? (cmd: string, args: string[]) => { dry(`${cmd} ${args.join(' ')}`); if (args[0] === 'print') throw new Error('not loaded'); return ''; }
      : (cmd: string, args: string[]) => execFileSync(cmd, args, { stdio: 'pipe' }).toString(),
    write(file: string, text: string) {
      if (dryRun && !dir) { dry(`write ${file}:\n${text}`); return; }
      mkdirSync(dirname(file), { recursive: true });
      writeFileSync(file, text);
    },
    remove(file: string) {
      if (dryRun && !dir) { dry(`remove ${file}`); return; }
      if (existsSync(file)) unlinkSync(file);
    },
  };
}

const BY_PLATFORM: Record<string, Record<string, (ctx: any) => void>> = {
  launchd: { install: installLaunchd, uninstall: uninstallLaunchd, status: statusLaunchd },
  systemd: { install: installSystemd, uninstall: uninstallSystemd, status: statusSystemd },
};

// Returns an exit code.
export function runService(action: string, options = {}) {
  const ctx = makeContext(options);
  const handlers = BY_PLATFORM[servicePlatform(ctx.platform)];
  if (!handlers) {
    ctx.log(manualInstructions({ nodePath: ctx.nodePath, script: join(ctx.root, 'dist', 'poll.js') }));
    return 1;
  }
  if (!handlers[action]) { console.error(`Unknown service action "${action}": install, uninstall or status.`); return 1; }
  try {
    handlers[action](ctx);
    return 0;
  } catch (err: any) {
    console.error(`service ${action} failed: ${String(err.stderr ?? '').trim() || err.message}`);
    return 1;
  }
}
