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

## 2. Network: off, or through the egress proxy

A runner has no network (`--network none`) unless the recipe names hosts **and** both `VERIFY_EGRESS_NETWORK` and
`VERIFY_EGRESS_PROXY` are set. Docker cannot filter by host name, so the allowlist is a proxy the operator runs
(`api/bin/egress-proxy.ts`, no dependency, in the bot's own image) on an *internal* network, the only one a runner
joins: the runner has no route out except through it.

```bash
echo 'VERIFY_EGRESS_ALLOW=registry.npmjs.org,*.pythonhosted.org' >> .env     # what the proxy lets through
docker compose -f compose.yaml -f compose.verify.yaml up -d egress-proxy
echo 'VERIFY_EGRESS_NETWORK=marginalia-verify-egress' >> .env
echo 'VERIFY_EGRESS_PROXY=http://egress-proxy:3128' >> .env
```

The proxy answers 403 to a host not in `VERIFY_EGRESS_ALLOW` (a name, or `*.name` for its subdomains, never an
address), to any port but 80 and 443, and to a name that resolves to a private, loopback or link-local address
(the cloud metadata service included). It is the operator's list that counts: a recipe's `hosts` is what a
person approved, so keep them inside the proxy's list.

## 3. Hosted: the bot in a container

A bot in a container must not hold the Docker socket (it could start anything as root on the host). It reaches
Docker through the **docker guard** (`api/bin/docker-guard.ts`, the bot's own image), the only holder of the
socket. The guard forwards a runner's create, start, wait, inspect, exec and removal, and only for runners it saw
created. It refuses a create that is not exactly a runner: the runner image, a non-root user, memory (no swap),
CPU and process limits, every capability dropped, a read-only root, no network or the egress one, and one mount,
a folder of the work volume at `/work`. Everything else of the daemon (images, volumes, networks, other
containers, the swarm) answers 403 and is logged by the guard (`docker compose logs docker-guard`).

```bash
docker build -t marginalia-runner deploy/runner                       # on the Docker host
export VERIFY_RUNNER_IMAGE=marginalia-runner VERIFY_EGRESS_ALLOW=registry.npmjs.org
docker compose -f compose.yaml -f compose.verify.yaml -f compose.verify-hosted.yaml up -d
```

The bot and the runners share one named volume (`marginalia-verify-work`): the copy of a worktree is made in it
and the runner mounts only that copy's folder. The bot's `/data` and Claude login are other volumes the runner
cannot name. The guard is on a network of its own, with the bot only; it has no login of its own, so that
network is its boundary.

**What it does not do:** it limits what can be asked of the daemon, not what a container escape can do once a
runner is running. Verification stays opt-in per project.
