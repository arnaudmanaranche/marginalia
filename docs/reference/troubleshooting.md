# Troubleshooting and known limitations

> Reference for the V1 behavior as shipped. V2 changes are in `../architecture.md` and `../adr/`; where they differ, those win.

- **`did not produce a report`**: run `npm run doctor -- --dry-run <iid>` and read the command's raw output in the error.
- **Tool refused**: add it to `CLAUDE_EXTRA_ALLOWED_TOOLS`.
- **MR skipped, branch checked out elsewhere**: switch branch in your own checkout; retried next poll.
- **Studio says "not built"**: `npm run studio:build`.
- **Command not found in headless mode**: commands from plugins are not seen by `doctor`; `--dry-run` is the real test.

## Known limitations

- Only works while the machine is on.
- Detection delay = up to one poll interval (no instant reaction like
  with a webhook).
- `GITLAB_TOKEN` lives in `.env`, never committed (already covered by
  `.gitignore`).
- Runs are contained, not isolated in a VM. Each `claude -p` gets `--settings` built in
  `api/src/claude-sandbox.mjs`: the sandbox confines Bash (writes to the bot worktree, the
  repo's `.git` and the reviews dir only; network to the GitLab host only; no read of
  `~/.ssh`, `~/.aws`, the bot's `.env`), and deny rules keep the Read/Edit/Write tools
  away from secrets, shell rc files and the trusted `.claude/{commands,agents,skills,hooks}`
  of your checkout (the sandbox does not cover those tools). Git is allowed one
  subcommand at a time (`api/src/allowed-tools.mjs`), never `git config`, `git -c` or
  `git push`, and credential-looking env vars are not passed (`CLAUDE_ENV_PASSTHROUGH`).
  A command refused by the sandbox or the allow-list fails the run with its name in the
  error. Git over SSH does not work *inside* the sandbox on macOS: the bot's own fetches
  run outside it, so reviews are unaffected, but a command that runs `git fetch` itself
  will fail. `CLAUDE_SANDBOX=false` turns the sandbox off; for stronger isolation, run
  the whole bot in a container or VM.
- The review command still runs with `Agent`, `EnterWorktree`/`ExitWorktree`, `Write`,
  and the GitLab/Atlassian connectors allowed, relying on the command and agent's own
  prompt discipline ("never post to GitLab") on top of the containment above.
- No automatic retry if `claude -p` fails: check the server logs, the MR will
  be retried on the next poll as long as the SHA hasn't changed... except if
  the SHA hasn't changed, `state.json` won't have been updated either (the
  failure happens before the state write), so the next poll will retry
  automatically.
- the triage command goes further than the review command: it edits files (`Edit`)
  and reads discussions off the self-hosted GitLab MCP server. The exact tool
  name(s) that server exposes for discussions aren't documented anywhere in
  the command files — if a triage run fails with a "tool not allowed" error,
  check the error for the tool name and add it to
  `CLAUDE_MR_COMMENTS_ALLOWED_TOOLS` in `api/src/allowed-tools.mjs`.
- Fixes the triage command applies are committed locally in the bot worktree and
  never pushed by the bot — review them, then push them from the studio
  or yourself from the `marginalia/<branch-slug>` local
  branch (see Behaviour above). Nothing lands on the real MR branch without
  that click.
