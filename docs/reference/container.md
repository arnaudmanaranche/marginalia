# Run in a container

> Reference for the V1 behavior as shipped. V2 changes are in `../architecture.md` and `../adr/`; where they differ, those win.

The `Dockerfile` packages the poller, the studio and the `claude` CLI (a pinned version, 2.1.306, changed
with `--build-arg CLAUDE_CODE_VERSION=...`). Nothing personal is baked in; it is all mounted:

| Mounted at | What | How |
| --- | --- | --- |
| `/data` | `config.json`, `marginalia.db`, `status.json`, the team copy, the bot worktrees | volume |
| `/home/node/.claude` | the `claude` login | volume |
| `/repos` | **dedicated** clones of the repos to review, used by nothing else (the bot makes its worktree inside each one's `.git`) | bind mount |

```bash
docker compose build
docker compose run --rm marginalia claude login   # once: follow the link it prints
docker compose run --rm marginalia init           # writes /data/config.json; repo paths are /repos/<name>
docker compose up -d                              # studio on http://localhost:4477
docker compose run --rm marginalia doctor         # checks it all from inside
```

Put the clones in `./repos` (or set `REPOS_DIR`). Then `docker compose run --rm marginalia <command>` is
`marginalia <command>` (`start` is the default); `claude`, `git`, `sh` and `node` run as themselves.

- **Commands and skills** must be visible *inside* the container: in each checkout's `.claude/`
  (mounted), in the team repo (`marginalia sync`), or in the `claude` volume's `commands/` and `skills/`.
  Your host's `~/.claude` is not mounted.
- **Trust.** Claude ignores a repo's own `.claude/settings*.json` until you accept its trust dialog, which nobody
  can do in a container. At start the image records that you trust the repos listed in your `config.json`
  (`docker/trust.mjs`, once you have logged in): the same decision as accepting the dialog in your own checkout.
  `MARGINALIA_TRUST_REPOS=0` turns it off.
- **Mount a dedicated clone, never the checkout you work in.** Git registers worktrees as absolute paths inside the
  repo's `.git`, and the container sees different paths from your host. A checkout used by both gets entries that
  point inside the container, and (before the bot stopped pruning) `git worktree prune` from the container deleted the
  registration of every host worktree. So the container refuses a repo that has worktrees it cannot see, `doctor`
  says so, and the bot never prunes. Clone the repo for the container only, e.g.
  `git clone <url> repos/webapp`, and give it the commands: put them in the team repo (`marginalia sync`), or copy
  your `.claude/commands`, `skills` and `agents` into `repos/webapp/.claude/`.
- **Git** reaches GitLab over HTTPS with the `GITLAB_TOKEN` from `config.json` or the environment: SSH
  remotes are rewritten at start and a credential helper hands over the token only to the GitLab host, so
  it is never written to a gitconfig or put in the environment of the Claude runs. `MARGINALIA_GIT_SSH=1`
  keeps SSH if you mount your own keys. The triage's fixes are committed and pushed as
  you: the GitLab user of the token, with its commit email, so a GitLab push rule on committer emails
  (`@yourcompany.com$`) accepts them. A fix committed under another identity (an agent's own commit, or
  an older bot's `marginalia@localhost`) is rewritten as you before it is pushed. `MARGINALIA_GIT_NAME` /
  `MARGINALIA_GIT_EMAIL` set to an identity of your own win over the GitLab one.
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
