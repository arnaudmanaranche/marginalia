// Linux: the bot started at login by a systemd *user* unit (no sudo):
// ~/.config/systemd/user/marginalia.service, `systemctl --user enable --now`.
// Side effects only go through `ctx` (see service.ts); the unit text is src/service-units.ts.
import { join } from 'node:path';
import { uiDist } from '../src/ui-assets.ts';
import { systemdUnit } from '../src/service-units.ts';

const UNIT = 'marginalia.service';
export const unitPath = (ctx: any) => join(ctx.dir ?? join(ctx.xdgConfig ?? join(ctx.home, '.config'), 'systemd', 'user'), UNIT);
const systemctl = (ctx: any, ...args: string[]) => ctx.exec('systemctl', ['--user', ...args]);

export function installSystemd(ctx: any) {
  if (!uiDist(ctx.root, ctx.exists)) ctx.warn('! Studio not built, http://localhost:4477 will show 503 (a packaged install ships it).');
  ctx.write(unitPath(ctx), systemdUnit({ nodePath: ctx.nodePath, script: join(ctx.root, 'dist', 'poll.js'), workingDir: ctx.root, path: ctx.path, env: ctx.unitEnv }));
  systemctl(ctx, 'daemon-reload');
  systemctl(ctx, 'enable', '--now', UNIT);
  ctx.log(`Service installed (${unitPath(ctx)}).
${ctx.dryRun ? 'Dry run: nothing was installed or started.' : 'The bot is running now and will start at every login.'}
  Studio: http://localhost:4477
  Logs:   journalctl --user -u marginalia -f
To keep it running when you are logged out: loginctl enable-linger $USER
Re-run \`marginalia service install\` after changing Node version (it pins ${ctx.nodePath}).`);
}

export function uninstallSystemd(ctx: any) {
  try { systemctl(ctx, 'disable', '--now', UNIT); } catch { /* not installed or not running */ }
  ctx.remove(unitPath(ctx));
  try { systemctl(ctx, 'daemon-reload'); } catch { /* no user manager reachable */ }
  ctx.log('Service removed. The bot is stopped.');
}

export function statusSystemd(ctx: any) {
  if (!ctx.exists(unitPath(ctx))) { ctx.log('Service not installed.'); return; }
  let state = 'inactive';
  try { state = systemctl(ctx, 'is-active', UNIT).trim(); } catch (err) { state = String(err.stdout ?? '').trim() || state; }
  ctx.log(`Service installed, ${state}. Logs: journalctl --user -u marginalia -f`);
}
