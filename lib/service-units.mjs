// The text of the files that start the bot at login: a launchd plist (macOS) and a
// systemd user unit (Linux). Pure (no config or I/O import), so it is unit-tested as
// strings; scripts/service-*.mjs write them and talk to launchctl / systemctl.

const esc = (s) => String(s).replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;');

export function plistXml(label, keys) {
  return `<?xml version="1.0" encoding="UTF-8"?>
<!DOCTYPE plist PUBLIC "-//Apple//DTD PLIST 1.0//EN" "http://www.apple.com/DTDs/PropertyList-1.0.dtd">
<plist version="1.0">
<dict>
  <key>Label</key><string>${esc(label)}</string>
${keys}
</dict>
</plist>
`;
}

// launchd starts with a bare PATH: the caller passes the one of the shell that
// installs it, so `claude`, `git` and terminal-notifier resolve as under `npm start`.
export function botPlistKeys({ nodePath, script, workingDir, path, logFile }) {
  return `  <key>ProgramArguments</key>
  <array>
    <string>${esc(nodePath)}</string>
    <string>${esc(script)}</string>
  </array>
  <key>WorkingDirectory</key><string>${esc(workingDir)}</string>
  <key>EnvironmentVariables</key>
  <dict>
    <key>PATH</key><string>${esc(path)}</string>
  </dict>
  <key>RunAtLoad</key><true/>
  <key>KeepAlive</key><dict><key>SuccessfulExit</key><false/></dict>
  <key>ThrottleInterval</key><integer>30</integer>
  <key>StandardOutPath</key><string>${esc(logFile)}</string>
  <key>StandardErrorPath</key><string>${esc(logFile)}</string>`;
}

// A one-shot `open`: SwiftBar is a regular app, launchd only starts it.
export function swiftbarPlistKeys(appPath) {
  return `  <key>ProgramArguments</key>
  <array>
    <string>/usr/bin/open</string>
    <string>-g</string>
    <string>${esc(appPath)}</string>
  </array>
  <key>RunAtLoad</key><true/>`;
}

// systemd splits ExecStart on spaces and expands % and $: quote each word and escape them.
const unitWord = (s) => `"${String(s).replace(/\\/g, '\\\\').replace(/"/g, '\\"').replace(/%/g, '%%').replace(/\$/g, '$$$$')}"`;

export function systemdUnit({ nodePath, script, workingDir, path, env = {} }) {
  const environment = Object.entries({ PATH: path, ...env })
    .filter(([, v]) => v)
    .map(([k, v]) => `Environment=${unitWord(`${k}=${v}`)}`);
  return `[Unit]
Description=Marginalia, GitLab MR review bot
After=network-online.target

[Service]
Type=simple
ExecStart=${unitWord(nodePath)} ${unitWord(script)}
WorkingDirectory=${String(workingDir).replace(/%/g, '%%')}
${environment.join('\n')}
Restart=on-failure
RestartSec=30

[Install]
WantedBy=default.target
`;
}

// How to keep the bot running on a platform with neither launchd nor systemd --user.
export function manualInstructions({ nodePath, script }) {
  return `No launchd or systemd --user on this platform. Keep it running with pm2:
  npm i -g pm2
  pm2 start ${script} --name marginalia --interpreter ${nodePath}
  pm2 save && pm2 startup`;
}

export function servicePlatform(platform) {
  if (platform === 'darwin') return 'launchd';
  if (platform === 'linux') return 'systemd';
  return 'manual';
}
