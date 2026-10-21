# marginalia

Poller that watches open MRs on a GitLab project and runs **your own** Claude
Code slash commands headless (`claude -p "/your-command MR !<iid>"`) in a
worktree dedicated to the bot: one command to review MRs from others
(`REVIEW_COMMAND`), one to triage the reviewer comments on your own
(`TRIAGE_COMMAND`, optional). The commands, agents and skills are yours; the
bot only checks out the MR, runs the command, and collects its report for the
local studio. It never posts to GitLab by itself.

Runs on your machine under your own `claude` login and GitLab token, via a
git worktree, so it never touches the branch you're working on. It **polls**
the GitLab API, so no webhook, Maintainer rights or HTTPS tunnel is needed.

## Quickstart

```bash
npm run setup                 # npm install + build the studio + interactive setup
                              # (asks GitLab URL/project/token, repo path, your commands;
                              # checks each answer live and writes .env)
npm run doctor                # read-only checks (also run at the end of setup), each failure says how to fix it
npm run doctor -- --dry-run 123   # runs the real chain on MR !123 into a temp file
npm start
```

No commands yet? Copy `examples/commands/*.md` and `examples/agents/*.md` into
your repo's (or `~/.claude`'s) `commands/` and `agents/`, then set
`REVIEW_COMMAND=/review` and `TRIAGE_COMMAND=/triage`.

## Install for the team

Packaged as an npm package, with the studio prebuilt, so a dev needs no clone:

```bash
npm i -g @worldia/marginalia   # needs the GitLab npm registry for the @worldia scope (below)
marginalia init                # GitLab, repos, commands -> ~/.marginalia/config.json; add a second project (back/front) when asked
marginalia doctor              # read-only checks
marginalia service install     # start at login: launchd (macOS) or systemd --user (Linux)
marginalia update              # later: install the latest version
```

It only works once the package has been published to the registry and each dev points the
scope at it (`npm config set @worldia:registry <registry URL>` plus a token): the
`.gitlab-ci.yml` publishes on a `vX.Y.Z` tag with `CI_JOB_TOKEN`, but that pipeline and the
registry setup are yours to do and have not been run for you. Other commands: `marginalia start`
(foreground), `marginalia service status|uninstall`, `marginalia migrate` (turns an existing
`.env` into `config.json`, leaves the `.env`, refuses to overwrite a `config.json` without
`--force`). `service install --dry-run` prints what it would write and run. `npm run init`,
`doctor` and `autostart` in a clone call the same code. On other platforms than macOS and
Linux, `service install` prints the `pm2` commands.

## Output contract (what your commands must know: nothing)

The bot appends instructions to every run (`--append-system-prompt`, see
`lib/report.mjs`): never post/push, write the final report to
`./.marginalia-report.md` in the working directory, or else print it in a
`<<<REVIEW_FILE path="...">>> ... <<<END_REVIEW_FILE>>>` block. `MR_REVIEW_BOT=1`
is also set, for commands written against the original contract. The report is
collected in this order:

1. `.marginalia-report.md` in the worktree;
2. the `<<<REVIEW_FILE>>>` block in stdout;
3. the raw final message, if longer than ~200 characters (logged as a warning:
   your command ignored the contract);
4. otherwise the run fails with the start of its output.

A tool refused in headless mode fails the run with a message pointing at
`CLAUDE_EXTRA_ALLOWED_TOOLS` in `.env`.

**Studio format (optional).** The studio works with any markdown, and gives the
same experience whatever command wrote it. The bot turns every report into one
normalized shape (`lib/findings.mjs`), stored next to it as `<slug>.findings.json`:
a verdict, a summary, and findings (`id`, `severity`, `title`, `path`, `line`,
`body`, `comment`). The studio lists, counts and posts from that shape, never from
the report's wording. It is read, in order of preference, from:

1. `.marginalia-findings.json`, which the contract asks the command to write
   (recommended; any extra field is ignored, and unknown severities such as
   `blocker`/`major`/`nit` are mapped):

   ```json
   { "verdict": "REQUEST_CHANGES", "summary": "One or two sentences.",
     "findings": [{ "id": "optional", "severity": "critical", "title": "Short title",
                    "path": "src/app/page.tsx", "line": 42, "body": "What and why.",
                    "comment": "The comment to post, ready as is." }] }
   ```

2. the markdown itself: a `**Verdict:** …` line (French labels work too),
   `## Critical` / `## Important` / `## Suggestions` sections with one bullet per
   finding, an optional `**Overview:**` line, and a blockquote under a bullet as its
   comment. The first `path[:line]` of the bullet is where *Add to review* anchors
   it in the diff (see `examples/commands/review.md`);
3. nothing: the studio says so in a notice, and the findings it could not read are
   left out of the per-finding "Add to review".

A finding's `id` comes from its file and title, not from the wording of its
comment, so it stays the same when a re-run rewords it. The bot warns (in its log
and in the studio) when a report could only be read partially.

To check that a new way of writing reviews works, add a folder to
`test/fixtures/skills/` (`report.md`, optionally `findings.json` or `stdout.txt`,
and an `expect.json`): `npm test` runs the whole contract against it.

## Requirements

- Node.js 22+ (`nvm use` picks the tested one from `.nvmrc`)
- The `claude` CLI installed, on `PATH` (or set `CLAUDE_BIN`), and **logged
  into your claude.ai account** (`claude login`) rather than only configured
  with `ANTHROPIC_API_KEY` — the review command needs the account's GitLab and
  Atlassian connectors to fetch the ticket and MR description. The bot
  explicitly strips `ANTHROPIC_API_KEY` from the environment before spawning
  `claude`, so even if it's set elsewhere on your machine it won't force
  API-key billing mode for these runs.
- **macOS for sandboxed runs.** The OS sandbox that confines a review's Bash commands to the
  worktree (`CLAUDE_SANDBOX`, on by default) is macOS Seatbelt. On Linux the bot runs, but runs
  are **not sandboxed**: only the Read/Edit deny rules apply, and `marginalia doctor` says so.
  Run it in a container or a VM there if you review code you do not trust. Notifications use
  `terminal-notifier`/`osascript` (macOS) or `notify-send` (Linux), else a log line. The Linux
  paths (systemd unit, `notify-send`) are covered by tests that check generated text only: they
  have not been run on a Linux machine.
- A GitLab token with the `api` scope, only used to list open MRs (the review
  itself goes through the connectors, not this token).
- A local checkout of the reviewed repo (`REPO_LOCAL_PATH`) with an `origin`
  remote, holding your commands/agents in `.claude/` (or in `~/.claude`).

Optional extras (macOS, none of them installed or required by `npm run setup`;
the bot and the studio work without them):

- `terminal-notifier` (`brew install terminal-notifier`): makes the "Review
  ready" notification clickable; without it you get a plain, non-clickable alert.
- The VS Code CLI (`code`, on `PATH` or set `VSCODE_BIN`): fallback to open a
  review when the studio isn't running.
- The [SwiftBar](#menu-bar-icon-optional-macos) menu bar icon, a separate,
  entirely optional add-on.

## Installation

```bash
cd ~/marginalia
npm install
cp .env.example .env
# edit .env: GITLAB_PROJECT_ID, GITLAB_TOKEN, GITLAB_USERNAME, REPO_LOCAL_PATH
```

## Running

```bash
npm start
```

On startup and then every `POLL_INTERVAL_MINUTES` minutes (5 by default; can be
changed at runtime from the studio's top bar, see below), the
script lists the project's open MRs and only reruns a review if the head SHA
has changed since the last pass (new commit, or MR never seen before).

## Several projects (back and front)

One install can watch several GitLab projects, each with its own repo, commands and
bot worktree. Put them in `config.json` in the data directory (the install folder for
a clone that has a `.env`, else `~/.marginalia`; `MARGINALIA_HOME` overrides it). It wins
over `.env`, which keeps working as a single project:

```json
{
  "gitlabBaseUrl": "https://git.example.com",
  "gitlabUsername": "me",
  "gitlabToken": "glpat-...",
  "projects": [
    { "gitlabProjectId": "group/back-end", "repoLocalPath": "/code/back-end", "kind": "back" },
    { "gitlabProjectId": "group/front-end", "repoLocalPath": "/code/front-end", "kind": "front",
      "reviewCommand": "/review-front", "allowedTargetBranches": ["develop"] }
  ]
}
```

Projects are polled one after the other, so a worktree is never shared. A project's `key`
(from the last part of its GitLab path, or set with `"key"`) prefixes its reviews in the
studio (`back-end/feat-x`), its entries in `state.json` and `posted.json`, and its worktree
(`<data dir>/worktrees/<key>`; the first project keeps `BOT_WORKTREE_DIR`). The first run
after upgrading moves the single-project `state.json` and `posted.json` under the first
project's key: keep a copy if you may go back to an older version. The studio's Settings
page overrides allowed target branches and excluded authors for all projects at once.
`npm run doctor -- --dry-run 123 --project front-end` tries the real chain on one MR.

## Team setup

A team shares its review skills and defaults through a **team repo**: an ordinary git
repo that every dev pulls. Everyone then reviews with the same skills and the same
defaults, and the codebase stays the memory. It is not a hosted service and not a GitLab
bot: each dev still runs their own marginalia, with their own token, on their own machine.

**What goes in the team repo** (a skeleton to copy is in `examples/team/`):

```
team.json         defaults and the list of GitLab projects (no path, no secret)
skills/           shared Claude Code skills       (skills/<name>/SKILL.md)
commands/         shared slash commands           (commands/<name>.md)
agents/           shared agents                   (agents/<name>.md)
```

```json
{
  "version": 1,
  "name": "Acme Web",
  "minMarginalia": "1.0.0",
  "defaults": {
    "reviewCommand": "/acme-web:review",
    "triageCommand": "/mr-comments",
    "allowedTargetBranches": ["develop"],
    "excludeAuthors": ["renovate-bot"],
    "claudeExtraAllowedTools": [],
    "reviewPromptExtra": "Answer in English."
  },
  "projects": [
    { "gitlabProjectId": "acme/web/back-end", "key": "back-end", "kind": "back" },
    { "gitlabProjectId": "acme/web/front-end", "key": "front-end", "kind": "front",
      "allowedTargetBranches": ["develop", "release"] }
  ]
}
```

`version` is 1, `name` and `version` are required, the rest is optional. A project entry
takes `gitlabProjectId`, `key`, `kind`, `reviewCommand`, `triageCommand`,
`allowedTargetBranches` and `excludeAuthors`. Unknown fields are errors (a typo would
otherwise be ignored), and `minMarginalia` makes an older marginalia say "update" instead
of misreading a newer file.

**How a dev joins.** Set `"teamRepo": "git@git.example.com:acme/marginalia-team.git"` in
`config.json` (or `MARGINALIA_TEAM_REPO`), run `node scripts/team-sync.mjs`, then add to
`projects` an entry with your `repoLocalPath` for each team project you review: the report
lists the ones you have not mapped. The repo is cloned into `<data dir>/team`; later syncs
fetch and fast-forward only. Offline, a local change in the copy, or a rewritten history
make the sync say so and leave the last good copy in use, so a review never waits on the
network. `doctor` reports a failed or stale sync and a team that needs a newer marginalia.

**How it layers.** For each setting, the order is: your own value, then the team's entry
for that project, then the team defaults, then the built-in default. Your `config.json`
is never rewritten, and a team value never replaces one you wrote. `claudeExtraAllowedTools`
are added to yours, so read them in the team repo's review like any other code. A team project you
have not mapped is not watched.

The team's skills, commands and agents are loaded into each headless run with
`claude --plugin-dir <data dir>/team-plugin` (a generated manifest plus links to the team
copy). Nothing is written into your repo's `.claude/`, and your own commands keep working.
Plugin commands carry the plugin's name, the slug of `name` in `team.json`:
`"name": "Acme Web"` gives `/acme-web:review`, which is what the team defaults'
`reviewCommand` should say. The team files are as protected as your own
`.claude/{commands,agents,skills,hooks}`: the run cannot edit them.

**What the bot never does.** It never posts to GitLab by itself, never listens for
webhooks or mentions, and never runs on a server; it does not write to your repo or to the
team repo (the copy is read-only, changes go through the team repo's own MRs); and the
team file never carries a token or a local path.

## Behaviour

- Optional filter on the target branch via `ALLOWED_TARGET_BRANCHES` (e.g. `develop`).
- Always ignores draft MRs, and those whose author is listed in
  `EXCLUDE_AUTHORS` (GitLab usernames, not emails, comma-separated).
- Ignores MRs with no activity (`updated_at`) for more than `STALE_AFTER_DAYS`
  days (14 by default): beyond that, they've likely diverged from `develop`
  or been abandoned.
- On first run, creates a git worktree of `REPO_LOCAL_PATH` at
  `BOT_WORKTREE_DIR` (detached, then a `.claude` symlink back to your real
  checkout so the command/agent/settings/connectors are available in it).
  Before each review/triage, checks out the MR's branch there — skipping the
  MR instead of forcing it if that branch happens to be checked out somewhere
  else (e.g. your own working copy). If you keep a worktree open per MR, set
  `BOT_CHECKOUT=detached`: the bot then checks out the MR's head without any
  local branch, so it never skips and never moves one of your branches
  (triage fixes still land on `marginalia/<branch-slug>`).

### Stacked MRs

An MR whose target branch is the source branch of another open MR is a layer of
a stack (rebuilt from the open MR list on every poll). For these:

- `ALLOWED_TARGET_BRANCHES` is checked against the branch the whole stack is
  based on, so upper layers are not filtered out.
- Layers are reviewed bottom to top, and each run gets the stack in its prompt:
  the layer list, the existing reviews of the other layers, and the layers above
  fetched locally (`refs/marginalia/stack/<iid>`) so it can check whether a later
  layer settles an issue before reporting it. The review ends with an
  `### Across layers` section (`- [settled-later|belongs-lower|assumes-upper !<iid>] <text>`).
- A layer is re-reviewed when the layer below it gets new commits
  (`state.json` keeps that commit under `stackBelow`).
- The studio shows the stack above the review as a merge board.
- Layers you authored yourself are not shown on the board (they go through triage).

### MRs authored by someone else (`GITLAB_USERNAME` doesn't match)

- Runs `claude -p "/code-review MR !<iid>"` in the bot worktree. The command
  handles ticket/MR lookup, diffing, the nested review worktree, and writing
  the result — this bot only triggers it and parses the review out of stdout.
- **The bot never posts anything to GitLab.** (The only way to post is the studio's opt-in button, see [Review studio](#review-studio).) Each review lands at
  `<REPO_LOCAL_PATH>/.claude/reviews/<branch-slug>.md`, for you to read and
  decide what to do with — the review command's own instructions forbid it from
  posting anything itself.
- State (last SHA reviewed per MR) is kept in `state.json`, at the project
  root (gitignored). Deleting it forces a re-review of all open MRs on the
  next poll.

### MRs you authored yourself (`mr.author.username === GITLAB_USERNAME`)

- Instead of the review command, polls the MR's GitLab discussions for comments
  left by someone other than you. Runs `claude -p "/mr-comments MR !<iid>"`
  in the bot worktree only when a new (or newer) peer comment appears since
  the last triage — a fresh push with no new comment does **not** retrigger
  it.
- the triage command triages every unresolved comment against the ticket AC and
  the diff: applies fixes for the ones it judges relevant directly in the bot
  worktree, and drafts (but never posts) a reply for the rest. In bot mode it
  writes its report to a plain file (`.marginalia-report.md`) in the bot
  worktree rather than printing it — a subagent's output only reaches the
  orchestrating command as a tool result, never as text `claude -p
  --output-format text` captures, so relying on the orchestrator re-emitting
  it verbatim as its own final message proved unreliable in practice (see
  `lib/claude-runner.mjs`'s comment on `MR_COMMENTS_REPORT_FILE`). This bot
  reads that file directly and writes the real report to
  `<REPO_LOCAL_PATH>/.claude/reviews/mr-comments-<branch-slug>.md`.
- **Fixes are committed locally in the bot worktree, never pushed.** Since
  the worktree gets `git clean -fdx` + `git reset --hard` before the next
  checkout, that commit is preserved separately under a local-only branch
  `marginalia/<branch-slug>` (the bot worktree shares its git object
  database with `REPO_LOCAL_PATH`, so this branch is visible from your real
  checkout too, e.g. `git log marginalia/<branch-slug>` or
  `git cherry-pick` from there — nothing is pushed by the bot). The studio's
  *Fixes to push* card checks them against the MR branch on origin: *ready*
  (on top of the current head), *pushed*, or *outdated* (the branch moved
  since the triage: re-run it). With `ALLOW_PUSH=true` it pushes them,
  fast-forward only, after a confirmation. A triage that commits nothing
  moves the previous fixes aside to `refs/marginalia/superseded/<branch-slug>`,
  and a triage during which the branch moved logs a warning.
- **Everything the triage writes is in English** (report, drafted replies,
  findings, commit messages): the bot's injected contract says so, whatever
  language the command or the comments are in.
- State (last peer-comment timestamp triaged per MR) is kept in `state.json`
  under `mineComments`, separately from the SHA-based state above.

Both flows share the same detailed step-by-step logs (worktree checkout,
duration, path of the written file), each line prefixed with `[MR !<iid>]` to
track several MRs across polls in the logs.

## Review studio

**Marginalia** is the local reader for the generated reviews, at `http://localhost:4477`
(`STUDIO_PORT`, bound to `127.0.0.1`, read-only). Vite + React + Tailwind
front end (`studio/`), served as static files by `studio/server.mjs`, which
`poll.mjs` starts at boot. Home lists the reviews as rows grouped by whose turn it is, read from GitLab and not from what this
browser has opened: *Needs your first review* (you have not reviewed it on GitLab), *Returned to you*
(the author pushed or answered after your review), *Review to send* (your comments wait in a pending
review), *Comments on your merge requests*, *Waiting on others* and, folded, *Done*. The poll reads
that standing for each MR (your notes, your approval or request for changes, pushes, open threads,
your drafts) and the studio refreshes the one MR right after you post, submit or delete a draft. A row
shows the author, what you decided, the Critical / Important counts, the risk, the verdict and the age (most urgent Jira ticket first when all three `JIRA_*` are
set in `.env`; `JIRA_BASE_URL` alone only links the ticket, newest first otherwise). A review opens as a
guided tour with its diff, has a copy button on the "Comment to post" blocks, and
a `⌘K` search. It refreshes live when a review file or `status.json` changes.

```bash
npm run studio:install   # once
npm run studio:build     # after any change under studio/src
npm run studio:dev       # Vite dev server with hot reload (bot must be running)
npm run dev              # bot + Vite dev server in one terminal; Ctrl+C stops both
```

`npm run dev` starts its own bot: stop the background one first
(`npm run autostart -- --uninstall`, or `pm2 stop marginalia`), or both will poll and the second can't bind the studio port.

The poll interval can be changed from the studio's top bar ("Poll every…").
It's saved to `settings.json` (gitignored) and overrides `POLL_INTERVAL_MINUTES`,
which stays the default. No restart: the bot re-arms its pending timer right
away. This is the studio's only write endpoint (`PUT /api/settings`); it
refuses requests whose `Host` or `Origin` isn't the studio itself.

**Posting (opt-in).** With `ALLOW_POSTING=true` in `.env`, each "Comment to post"
block gets an *Add to review* button. It opens a confirmation showing the final
(possibly edited) text and the target MR, then creates a GitLab **draft note**
(inline on the file/line when it can, else general) through the API with your
`GITLAB_TOKEN`. Drafts are private to you: nothing is visible to the MR author
until the *Submit review (N)* button, which asks for an optional summary and
publishes everything as one real GitLab review (`draft_notes/bulk_publish`; drafts
started in GitLab's own UI are published too). The MR is resolved server-side from
`status.json`, never from the request. Comments are remembered in `posted.json`
(gitignored) so the same one can't be added twice, and shown with an "In pending
review" then "Posted" badge. Off by default: without the flag the buttons don't
exist and `POST /api/post` and `POST /api/submit-review` answer 403.

**Design system (Scholia).** The studio's UI is documented in Storybook:
`npm run studio:storybook` (port 6006). It holds the foundations from `DESIGN.md`
(colours, type, radii, spacing) and a story per presentational component. Light and dark
follow the OS, as in the app. `npm --prefix studio run build-storybook` builds a static copy
(`studio/storybook-static`, gitignored).

**API contract.** The server is a Hono app (`studio/app.mjs`, routes in `studio/routes-*.mjs`).
Every request body is validated with the zod schemas in `studio/schemas.mjs`, and the OpenAPI 3.1
document is generated from those same schemas: with the studio running, read it at
<http://localhost:4477/openapi.json>, rendered at <http://localhost:4477/api-docs.html> (read-only:
"Try it out" is off, since the write endpoints post to GitLab as you). To change an endpoint, change
its route and schema; keep `studio/src/lib/api.ts` in step with the schemas.

The "Review ready" notification and the SwiftBar menu open the studio (the
notification falls back to VS Code if the studio isn't listening).

**Live progress and cost of each run.** Runs use `claude -p --output-format
stream-json`. While a run is going, the studio shows its last steps above the
review's details ("Opening …", "Reading …", the commands it runs). When it ends,
its cost, output tokens and turns are logged and recorded in the `run` table of `marginalia.db`
(gitignored), so you can see what each pass really costs.

## Run in a container

The `Dockerfile` packages the poller, the studio and the `claude` CLI (a pinned version, 2.1.306, changed
with `--build-arg CLAUDE_CODE_VERSION=...`). Nothing personal is baked in; it is all mounted:

| Mounted at | What | How |
| --- | --- | --- |
| `/data` | `config.json`, `marginalia.db`, `status.json`, the team copy, the bot worktrees | volume |
| `/home/node/.claude` | the `claude` login | volume |
| `/repos` | your checkouts of the repos to review (the bot makes its worktree inside each one's `.git`) | bind mount |

```bash
docker compose build
docker compose run --rm marginalia claude login   # once: follow the link it prints
docker compose run --rm marginalia init           # writes /data/config.json; repo paths are /repos/<name>
docker compose up -d                              # studio on http://localhost:4477
docker compose run --rm marginalia doctor         # checks it all from inside
```

Put your checkouts in `./repos` (or set `REPOS_DIR`). Then `docker compose run --rm marginalia <command>` is
`marginalia <command>` (`start` is the default); `claude`, `git`, `sh` and `node` run as themselves.

- **Commands and skills** must be visible *inside* the container: in each checkout's `.claude/`
  (mounted), in the team repo (`marginalia sync`), or in the `claude` volume's `commands/` and `skills/`.
  Your host's `~/.claude` is not mounted.
- **Trust.** Claude ignores a repo's own `.claude/settings*.json` until you accept its trust dialog, which nobody
  can do in a container. At start the image records that you trust the repos listed in your `config.json`
  (`docker/trust.mjs`, once you have logged in): the same decision as accepting the dialog in your own checkout.
  `MARGINALIA_TRUST_REPOS=0` turns it off.
- **Leftover worktree entry.** The bot makes its worktree (`/data/worktree`) through the mounted repo's `.git`, so
  your host repo lists it, as `prunable`, once the container is gone. `git worktree prune` clears it.
- **Git** reaches GitLab over HTTPS with the `GITLAB_TOKEN` from `config.json` or the environment: SSH
  remotes are rewritten at start and a credential helper hands over the token only to the GitLab host, so
  it is never written to a gitconfig or put in the environment of the Claude runs. `MARGINALIA_GIT_SSH=1`
  keeps SSH if you mount your own keys.
- **Sandbox.** The OS sandbox is macOS-only; in the image `CLAUDE_SANDBOX=false` and **the container is the
  boundary**: a non-root user, `cap_drop: ALL`, no host access beyond the mounted folders. Reviews run
  Bash over code from other people's MRs, so also limit the container's network (an egress rule that
  allows only GitLab, Jira and the Claude API) if you do not fully trust that code.
- **The studio has no login.** It listens on `0.0.0.0` *inside* the container; `compose.yaml` publishes
  it on `127.0.0.1` only. Do not publish it on a network interface. If you map another host port, list its
  Host values in `STUDIO_ALLOWED_HOSTS` (compose does this for `STUDIO_HOST_PORT`).
- **`config.json` and the environment.** For `CLAUDE_BIN`, `CLAUDE_SANDBOX`, `NOTIFICATIONS` and `STUDIO_PORT`, a real
  environment variable beats `config.json` (which always has a value for them); everything else is `config.json`'s.
- **`ANTHROPIC_API_KEY` is ignored on purpose** (the reviews need the claude.ai account's connectors), as
  outside the container.
- To update: `docker compose build --pull && docker compose up -d`. State lives in the volumes, so it survives.

CI builds and pushes the image to the project's registry on a `vX.Y.Z` tag (`image` job).

## Keeping the script running

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

If [SwiftBar](#menu-bar-icon-optional-macos) is installed, `npm run autostart` also
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
(the [studio](#review-studio), which is where the MRs and reviews are listed).
*Poll now* just sends `SIGUSR1` to the bot, which you can also do by hand:
`kill -USR1 <pid>` (the pid is in `status.json`). It's ignored if a poll is
already running.

The bot also sends macOS notifications when a review is ready, when one fails,
and when polling starts failing. Set `NOTIFICATIONS=false` in `.env` to turn
them off.

Polls never overlap: the next one is scheduled one poll interval after
the previous one *finishes*, so a long review just pushes it back.

## Logs and type checking

The bot logs through [pino](https://getpino.io): one human line per event, with the project and MR
when there is one (`[2026-10-21T15:17:14.285Z] INFO: [webapp] [MR !3987] Starting review`),
coloured only in a terminal so `tail -f ~/Library/Logs/marginalia.log` stays readable. Set
`MARGINALIA_LOG=json` for one JSON object per line (with `project` and `iid` as keys), and
`MARGINALIA_LOG_LEVEL` (`debug`, `info`, `warn`, `error`; default `info`) to change the verbosity.
The `npm run doctor` / `init` / `marginalia` command output is plain console text, not the log.

`npm run typecheck` runs `tsc` over `lib/` and the studio server (`tsconfig.json`: strict, but
without `noImplicitAny`, so parameters need no annotation). A module opts in with `// @ts-check`
on its first line, and CI fails if one stops passing; start every new module with it. `poll.mjs`,
`bin/` and `scripts/` are not opted in yet.

## Troubleshooting

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
  `lib/claude-sandbox.mjs`: the sandbox confines Bash (writes to the bot worktree, the
  repo's `.git` and the reviews dir only; network to the GitLab host only; no read of
  `~/.ssh`, `~/.aws`, the bot's `.env`), and deny rules keep the Read/Edit/Write tools
  away from secrets, shell rc files and the trusted `.claude/{commands,agents,skills,hooks}`
  of your checkout (the sandbox does not cover those tools). Git is allowed one
  subcommand at a time (`lib/allowed-tools.mjs`), never `git config`, `git -c` or
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
  `CLAUDE_MR_COMMENTS_ALLOWED_TOOLS` in `lib/allowed-tools.mjs`.
- Fixes the triage command applies are committed locally in the bot worktree and
  never pushed by the bot — review them, then push them from the studio
  (`ALLOW_PUSH=true`) or yourself from the `marginalia/<branch-slug>` local
  branch (see Behaviour above). Nothing lands on the real MR branch without
  that click.
