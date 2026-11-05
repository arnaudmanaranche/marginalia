# marginalia

Marginalia is a software factory (see [ADR 0006](docs/adr/0006-marginalia-is-a-software-factory.md)):
it learns a project, runs jobs on it and leaves every decision to a person. Review is the first line.
The **bot** (`api/`) runs the agent on a merge request, with whatever skills and sub-agents it
chooses, and checks the review against a fixed contract before it is shown or posted. The
**studio** (`ui/`) is where a person reads the review, decides what to say and follows every job.
The bot only posts when a person asked for it, by mentioning `@marginalia` in an MR or by clicking
in the studio.

Architecture and decisions: [`docs/architecture.md`](docs/architecture.md) and
[`docs/adr/`](docs/adr/). Product and promises: [`PRODUCT.md`](PRODUCT.md). Words:
[`GLOSSARY.md`](GLOSSARY.md).

Locally it runs on your machine under your own `claude` login and GitLab token, in an ephemeral git
worktree so it never touches the branch you work on, and it **polls** the GitLab API, so no webhook
or Maintainer rights are needed. Hosted, it sits behind HTTPS and GitLab OAuth
([`docs/reference/hosting.md`](docs/reference/hosting.md)) and can also take mentions by webhook.

## Quickstart

```bash
npm run setup                 # npm install + build the studio + interactive setup
                              # (asks GitLab URL/project/token, repo path, triage on/off;
                              # checks each answer live and writes .env)
npm run doctor                # read-only checks (also run at the end of setup), each failure says how to fix it
npm run doctor -- --dry-run 123   # runs the real chain on MR !123 into a temp file
npm start
```

Every review and triage runs Marginalia's staged pipeline (see `docs/reference/review-flow.md`).
It reads your repo's `CLAUDE.md`, `AGENTS.md`, `CONTRIBUTING` and `.claude/agents/code-reviewer.md`
as its rules: `api/examples/agents/reviewer.md` is a starting point for the last one.

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
- The [SwiftBar](docs/reference/local-helpers.md#menu-bar-icon-optional-macos) menu bar icon, a separate,
  entirely optional add-on.

## Installation

```bash
cd ~/marginalia
npm install
cp api/.env.example .env      # a clone keeps its .env at the repo root
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

## Documentation

| | |
| --- | --- |
| [`GLOSSARY.md`](GLOSSARY.md), [`PRODUCT.md`](PRODUCT.md), [`DESIGN.md`](DESIGN.md) | words, product and promises, the studio's look |
| [`docs/architecture.md`](docs/architecture.md), [`docs/adr/`](docs/adr/) | target architecture and why |
| [`docs/guidelines/api.md`](docs/guidelines/api.md), [`docs/guidelines/ui.md`](docs/guidelines/ui.md) | how code is written |
| [`docs/reference/configuration.md`](docs/reference/configuration.md) | several projects, `config.json` |
| [`docs/reference/output-contract.md`](docs/reference/output-contract.md) | what a command must know, and the findings shape |
| [`docs/reference/review-flow.md`](docs/reference/review-flow.md) | polling rules, stacked MRs, staged pipeline, triage |
| [`docs/reference/studio.md`](docs/reference/studio.md) | the studio, posting, API contract |
| [`docs/reference/team-setup.md`](docs/reference/team-setup.md) | sharing skills through a team repo |
| [`docs/reference/container.md`](docs/reference/container.md) | Docker |
| [`docs/reference/local-helpers.md`](docs/reference/local-helpers.md) | autostart, menu bar, notifications |
| [`docs/reference/operations.md`](docs/reference/operations.md) | logs, type checking, PostHog |
| [`docs/reference/troubleshooting.md`](docs/reference/troubleshooting.md) | troubleshooting and known limitations |
