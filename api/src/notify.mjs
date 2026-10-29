// @ts-check
import { execFile } from 'node:child_process';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { NOTIFICATIONS, VSCODE_BIN, STUDIO_PORT } from './config.mjs';
import { notifyCommands, openCommand } from './notify-commands.mjs';
import { logger } from './logger.mjs';

// Same mark as the studio favicon, rasterised: terminal-notifier can't read SVG.
const LOGO_PATH = join(dirname(fileURLToPath(import.meta.url)), '..', '..', 'ui', 'public', 'logo.png');

// openPath, when given, makes the notification clickable where the platform allows
// it (terminal-notifier on macOS): clicking opens the review in the local studio
// (studio/server.mjs), or in VS Code if the studio isn't listening. Elsewhere the
// notification is plain, or just a log line when no notifier exists.
export function notify(title, message, openPath, platform = process.platform) {
  if (NOTIFICATIONS === 'false') return;
  const click = openPath ? openCommand({ openPath, port: STUDIO_PORT, vscodeBin: VSCODE_BIN, platform }) : null;
  const attempts = notifyCommands({ platform, title, message, logoPath: LOGO_PATH, click });
  const logOnly = () => logger.info(`[notify] ${title}: ${message}`);
  if (!attempts.length) { logOnly(); return; }
  const next = (i) => execFile(...(/** @type {[string, string[]]} */ (attempts[i])), (err) => {
    if (!err) return;
    if (i + 1 < attempts.length) next(i + 1);
    else logOnly();
  });
  next(0);
}
