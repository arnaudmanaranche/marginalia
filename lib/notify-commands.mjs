// @ts-check
import { basename } from 'node:path';

// The commands behind a desktop notification, per platform. Pure (no config or
// I/O import): lib/notify.mjs runs them, in order, until one works.

// Shell command run when a notification is clicked: the review in the local studio,
// or in VS Code if the studio isn't listening. Single-quoted, so an odd path can't
// break out of it.
const quote = (s) => `'${String(s).replace(/'/g, `'\\''`)}'`;
export function openCommand({ openPath, port, vscodeBin, platform }) {
  const url = `http://localhost:${port}/#/${basename(openPath, '.md')}`;
  const opener = platform === 'darwin' ? 'open' : 'xdg-open';
  return `curl -sf -m 1 -o /dev/null http://127.0.0.1:${port}/api/reviews && ${opener} ${quote(url)} || ${vscodeBin} ${quote(openPath)}`;
}

// Title and message go through argv rather than being spliced into the
// AppleScript source, so MR titles with quotes can't break it.
// Returns [[binary, args], ...]: the first one is tried, then the next if it fails.
export function notifyCommands({ platform, title, message, logoPath, click }) {
  if (platform === 'darwin') {
    const plain = ['osascript', ['-e', 'on run argv', '-e', 'display notification (item 2 of argv) with title (item 1 of argv)', '-e', 'end run', title, message]];
    // terminal-notifier isn't a default macOS install; osascript still notifies, just
    // without the logo and the click action.
    const clickable = ['terminal-notifier', ['-title', title, '-message', message, '-appIcon', logoPath, ...(click ? ['-execute', click] : [])]];
    return [clickable, plain];
  }
  if (platform === 'linux') return [['notify-send', ['--app-name=marginalia', `--icon=${logoPath}`, title, message]]];
  return [];
}
