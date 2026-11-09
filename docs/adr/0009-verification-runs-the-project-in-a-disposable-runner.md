# 0009. Verification runs the project, in a disposable runner

Status: accepted, 2026-11-06. Narrows the read-only promise of ADR 0008's stages; it does not lift it.

Decision: a review may **reproduce** a finding against the project before a person is asked to trust it. Only a finding about behaviour (the reviewer labels it `proof: runtime`) that is critical or important is tried, a few per review at most; a finding about a pattern or a rule of the repo is never run. CI already runs the typecheck and the static checks, so verification is not about those.

Where it runs: never in the bot's process or container. Each verification runs in a **disposable runner**, a container started for it and removed after. The agent never executes code itself: it reaches the runner through one narrow `run` tool the bot serves, which runs a single command of the project's approved recipe and returns its exit code and a truncated output.

- The runner holds a copy of the MR's worktree and nothing else: no Claude login, no data directory, no token, no `.env`. Read-only root, a scratch tmpfs, no capabilities, no new privileges, a non-root user.
- Limits, always set, per-project override: 2 CPUs, 4 GB of memory without swap, 256 processes, 10 minutes of wall clock, output truncated.
- Network is off. A project may name hosts in its recipe (a package registry, a staging API) and only those are reachable, never the host network.
- The recipe (`verification` in the project context: commands, hosts, notes) is learned by the Understand job and **approved by a person**: approving the context is approving what may run. No approved recipe, no verification.
- Verification is off by default and opted into per project. Without Docker, without the opt-in or without a recipe a finding is `skipped` and the report says why; `doctor` says what is missing.
- A verification that fails or times out never fails the review: the finding is `inconclusive`. A finding that is `not reproduced` is kept and flagged, never dropped: a person decides.
- Hosted: the Docker socket is never mounted into the bot's container. The bot's `DOCKER_HOST` is the **docker guard** (`api/bin/docker-guard.ts`, in `compose.verify-hosted.yaml`), the only holder of the socket: it forwards a runner's create, start, wait, inspect, exec and removal, and only for runners it saw created, and refuses a create that is not exactly a runner (the runner image, a non-root user, memory, CPU and process limits, every capability dropped, a read-only root, `none` or the egress network, and one mount: a folder of a named work volume at `/work`). A socket proxy that filters by API section cannot do this, since one `create` is enough to ask for a privileged container. The copy of the worktree is made in that volume, which the bot and the runner share.

Why not the agent's own Bash in the OS sandbox: it runs code the MR's author wrote. The macOS sandbox does not exist in the image (`CLAUDE_SANDBOX=false`, the container is the boundary) and there the same container holds the Claude login and the data directory. An allowlist of command prefixes is no boundary either, since a test file the MR changes runs anything. The sandbox has no CPU, memory or process limit at all today.

Residual risk: a container escape. The measures above lower it, they do not remove it, which is why it is opt-in.

What stays: the bot only posts when a person asked; only `api/` holds the GitLab write token; nothing that fails the contract is shown; the bot knows no stack (how to run a project is in its approved context).

Verification of this decision: runner tests on its arguments (no secret mount, limits always present, no network unless named), a timeout that kills the container, and a seeded MR whose test reads `~/.ssh`, reaches the network and loops forever, which must fail or be killed.
