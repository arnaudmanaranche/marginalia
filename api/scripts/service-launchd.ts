// macOS: the bot (and SwiftBar, if installed) started at login through per-user
// LaunchAgents, no sudo. Side effects only go through `ctx` (see service.ts), so a
// dry run can record them. The plist text is src/service-units.ts.
import { join } from 'node:path';
import { uiDist } from '../src/ui-assets.ts';
import { plistXml, botPlistKeys, swiftbarPlistKeys } from '../src/service-units.ts';

const BOT = 'com.marginalia.bot';
const MENUBAR = 'com.marginalia.swiftbar';
const plistPath = (ctx: any, label: string) => join(ctx.dir ?? join(ctx.home, 'Library', 'LaunchAgents'), `${label}.plist`);
export const launchdLog = (ctx: any) => join(ctx.home, 'Library', 'Logs', 'marginalia.log');
const domain = (ctx: any) => `gui/${ctx.uid}`;

const loaded = (ctx: any, label: string) => { try { ctx.exec('launchctl', ['print', `${domain(ctx)}/${label}`]); return true; } catch { return false; } };
// bootout returns before the job is gone, and bootstrapping it again meanwhile
// fails with "5: Input/output error": wait until launchd has let it go.
const unload = (ctx: any, label: string) => {
  if (!loaded(ctx, label)) return;
  try { ctx.exec('launchctl', ['bootout', `${domain(ctx)}/${label}`]); } catch { /* already going away */ }
  for (let i = 0; i < 50 && loaded(ctx, label); i += 1) ctx.sleep(200);
};

const install = (ctx: any, label: string, keys: any) => {
  ctx.write(plistPath(ctx, label), plistXml(label, keys));
  unload(ctx, label);
  ctx.exec('launchctl', ['bootstrap', domain(ctx), plistPath(ctx, label)]);
};

const remove = (ctx: any, label: string) => {
  unload(ctx, label);
  ctx.remove(plistPath(ctx, label));
};

// The plugin is only picked up if it sits in SwiftBar's plugin folder.
const swiftbarPluginLinked = (ctx: any) => {
  try {
    const dir = ctx.exec('defaults', ['read', 'com.ameba.SwiftBar', 'PluginDirectory']).trim();
    return ctx.exists(join(dir, 'marginalia.10s.sh'));
  } catch {
    return false;
  }
};

export function installLaunchd(ctx: any) {
  if (!uiDist(ctx.root, ctx.exists)) ctx.warn('! Studio not built (npm run studio:build), http://localhost:4477 will show 503.');
  const logFile = launchdLog(ctx);
  ctx.mkdir(join(ctx.home, 'Library', 'Logs'));
  install(ctx, BOT, botPlistKeys({ nodePath: ctx.nodePath, script: join(ctx.root, 'dist', 'poll.js'), workingDir: ctx.root, path: ctx.path, logFile, env: ctx.unitEnv }));
  ctx.log(`Autostart installed (${plistPath(ctx, BOT)}).
${ctx.dryRun ? 'Dry run: nothing was installed or started.' : 'The bot is running now and will start at every login.'}
  Studio: http://localhost:4477
  Logs:   tail -f ${logFile}
Re-run \`marginalia service install\` after changing Node version (it pins ${ctx.nodePath}).`);
  const app = ctx.swiftbarApp();
  if (!app) { remove(ctx, MENUBAR); return; }
  install(ctx, MENUBAR, swiftbarPlistKeys(app));
  ctx.log('SwiftBar opened, and will open at every login.');
  if (!swiftbarPluginLinked(ctx)) ctx.warn('! The marginalia plugin is not in SwiftBar\'s plugin folder: see "Menu bar icon" in the README.');
}

export function uninstallLaunchd(ctx: any) {
  remove(ctx, BOT);
  remove(ctx, MENUBAR);
  ctx.log('Autostart removed. The bot is stopped (SwiftBar keeps running until you quit it).');
}

export function statusLaunchd(ctx: any) {
  try {
    const out = ctx.exec('launchctl', ['print', `${domain(ctx)}/${BOT}`]);
    const state = out.match(/^\s*state = (.+)$/m)?.[1] ?? 'unknown';
    const pid = out.match(/^\s*pid = (\d+)$/m)?.[1];
    ctx.log(`Autostart installed, ${state}${pid ? ` (pid ${pid})` : ''}. Logs: ${launchdLog(ctx)}`);
  } catch {
    ctx.log(ctx.exists(plistPath(ctx, BOT)) ? 'Autostart installed but not loaded: marginalia service install' : 'Autostart not installed.');
  }
  ctx.log(ctx.exists(plistPath(ctx, MENUBAR)) ? 'SwiftBar opens at login.' : 'SwiftBar is not opened at login.');
}
