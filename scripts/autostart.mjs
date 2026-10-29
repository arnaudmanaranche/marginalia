// `npm run autostart` (install and start), `-- --uninstall`, `-- --status`: the same as
// `marginalia service install|uninstall|status`, kept for the README's older command.
// Logic lives in service.mjs (launchd on macOS, systemd --user on Linux).
import '../api/src/node-check.mjs';
import { runService } from './service.mjs';

const arg = process.argv[2];
const action = { undefined: 'install', '--uninstall': 'uninstall', '--status': 'status' }[arg];
if (!action) {
  console.error(`Unknown option ${arg}. Use --status or --uninstall.`);
  process.exit(1);
}
process.exit(runService(action));
