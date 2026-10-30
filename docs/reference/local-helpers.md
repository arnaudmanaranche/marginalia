# Local helpers: autostart, menu bar, notifications

> Reference for the V1 behavior as shipped. V2 changes are in `../architecture.md` and `../adr/`; where they differ, those win.

On macOS, let it start at every login (a per-user LaunchAgent, no sudo, no
extra tool). It runs `npm start`, so the studio is the built one on
http://localhost:4477:

```bash
npm run autostart                  # install and start now; re-run after changing Node version
npm run autostart -- --status      # running? pid?
npm run autostart -- --uninstall   # stop and remove
tail -f ~/Library/Logs/marginalia.log
```

The agent keeps the `PATH` of the shell you installed it from, so `claude`, `git`
and `terminal-notifier` resolve the same way as in your terminal. It is restarted
if it crashes. Stop it before `npm run dev`, or both will poll.

If [SwiftBar](local-helpers.md#menu-bar-icon-optional-macos) is installed, `npm run autostart` also
opens it at login (a second agent, `com.marginalia.swiftbar`), so the menu bar icon
comes up with the bot. Install SwiftBar first, or re-run `npm run autostart` after.

Elsewhere, use a process manager, for example `pm2`:

```bash
npm install -g pm2
pm2 start poll.mjs --name marginalia
pm2 save
pm2 startup   # to restart on machine boot
```

## Menu bar icon (optional, macOS)

Not part of the setup: `npm run setup` and `npm run doctor` neither install nor
check it, and the bot runs the same without it. Install it only if you want a
status icon in your menu bar.

The bot writes its live status to `status.json` (gitignored), which a
[SwiftBar](https://github.com/swiftbar/SwiftBar) plugin turns into a menu bar
icon, refreshed every 10 seconds:

```bash
brew install --cask swiftbar
# on first launch SwiftBar asks for a plugin folder, e.g. ~/SwiftBarPlugins
ln -s ~/marginalia/swiftbar/marginalia.10s.sh ~/SwiftBarPlugins/
npm run autostart   # optional: opens SwiftBar (and the bot) at every login
```

| Icon | Meaning |
| --- | --- |
| ✓ seal | Idle, waiting for the next poll (orange + a count if some reviews failed) |
| circular arrows | Polling GitLab |
| eye + `!<iid>` | Reviewing that MR |
| red triangle | The last poll failed (GitLab unreachable, expired token, ...) |
| grey octagon | The bot isn't running |

The dropdown is deliberately small: the bot's state (idle / polling /
reviewing), the last poll and the last review, *Poll now* and *Open reviews*
(the [studio](studio.md), which is where the MRs and reviews are listed).
*Poll now* just sends `SIGUSR1` to the bot, which you can also do by hand:
`kill -USR1 <pid>` (the pid is in `status.json`). It's ignored if a poll is
already running.

The bot also sends macOS notifications when a review is ready, when one fails,
and when polling starts failing. Set `NOTIFICATIONS=false` in `.env` to turn
them off.

Polls never overlap: the next one is scheduled one poll interval after
the previous one *finishes*, so a long review just pushes it back.
