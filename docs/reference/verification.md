# Running verification: what an operator sets up

Verification (ADR 0009, `docs/adr/0009-verification-runs-the-project-in-a-disposable-runner.md`) reproduces a
finding about behaviour by running the project in a disposable container. How a review uses it is in
[Review flow](review-flow.md); the settings are in [Configuration](configuration.md). This page is what has to
exist on the machine first.

## 1. Docker and a runner image

The bot needs a Docker it can reach (`DOCKER_BIN`, `docker info` answers). The runner image holds the toolchain
of the projects that opt in (`"verify": true`), and nothing of the bot.

```bash
docker build -t marginalia-runner deploy/runner     # the sample: Node 22, npm, Python 3, a C toolchain
echo 'VERIFY_RUNNER_IMAGE=marginalia-runner' >> .env
npm run doctor                                      # "Verification [project]" says what is missing
```

The sample (`deploy/runner/Dockerfile`) is a starting point: add what your recipes' `setup` and `test` steps
call, and keep the image free of secrets. The bot starts it with a read-only root, `--cap-drop ALL`,
`no-new-privileges`, a tmpfs for `/tmp` and `/home/runner`, the project's limits (2 CPUs, 4 GB, 256 processes,
10 minutes by default) and no network.
