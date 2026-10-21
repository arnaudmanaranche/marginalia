// @ts-check
// What this platform gives the bot, said plainly for `marginalia doctor`. Pure.

// Seatbelt (lib/claude-sandbox.mjs, the `sandbox` block of the run settings) exists
// on macOS only. Elsewhere `claude` is started with the permission deny rules alone:
// Bash is not confined to the worktree and has network access.
export function sandboxStatus({ platform, sandboxEnabled }) {
  if (platform === 'darwin') {
    return sandboxEnabled
      ? { level: 'ok', message: 'Runs are sandboxed (macOS Seatbelt: Bash confined to the worktree, network limited to the GitLab host)' }
      : { level: 'warn', message: 'CLAUDE_SANDBOX is off: Bash in headless runs is not confined (only the Read/Edit deny rules apply)' };
  }
  return {
    level: 'warn',
    message: `Runs are NOT sandboxed on ${platform}: the OS sandbox is macOS-only, so a review runs Bash with your user's full file and network access (only the Read/Edit deny rules apply). Run marginalia inside a container or a VM if you review code you do not trust.`,
  };
}

// Optional notifier binary per platform, with how to get it.
export function notifierAdvice(platform) {
  if (platform === 'darwin') return { bin: 'terminal-notifier', hint: 'notifications are not clickable (brew install terminal-notifier)' };
  if (platform === 'linux') return { bin: 'notify-send', hint: 'no desktop notifications, only log lines (install libnotify-bin / libnotify)' };
  return null;
}
