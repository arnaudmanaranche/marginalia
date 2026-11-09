# A sample runner image for the verification (ADR 0009): the toolchain a reproduction needs and
# nothing of the bot. Build it with the toolchain of your projects, then point VERIFY_RUNNER_IMAGE at it:
#   docker build -t marginalia-runner deploy/runner && echo VERIFY_RUNNER_IMAGE=marginalia-runner >> .env
# What this sample has: Node and npm, Python 3 and a C toolchain for native modules. Add what your
# recipes' `setup` and `test` steps call (a PHP CLI, Go, a database client) and drop what they never use.
# It holds no secret and no Claude login: the bot mounts one copy of the worktree, read-write, and
# starts it with a read-only root, no capability, limits and no network (see docs/reference/verification.md).
FROM node:22-bookworm-slim

RUN apt-get update \
 && apt-get install -y --no-install-recommends python3 make g++ ca-certificates \
 && rm -rf /var/lib/apt/lists/*

# The runner starts as the owner of the copy (--user), not as this user; the home is a tmpfs the bot
# mounts at /home/runner, so tools that write caches there work with a read-only root.
ENV HOME=/home/runner NPM_CONFIG_UPDATE_NOTIFIER=false NPM_CONFIG_FUND=false
WORKDIR /work
CMD ["sleep", "infinity"]
