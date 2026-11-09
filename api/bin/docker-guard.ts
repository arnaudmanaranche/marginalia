#!/usr/bin/env node
// The docker guard (ADR 0009, hosted): the only thing that touches the Docker socket, so the bot's own
// container never does. The bot's DOCKER_HOST points here; only what a verification needs is
// forwarded (see src/docker-guard-policy.ts). It listens on a private network nothing else joins.
//   GUARD_IMAGE    the runner image (VERIFY_RUNNER_IMAGE)       GUARD_VOLUME    the work volume
//   GUARD_NETWORKS the egress network(s), comma separated        GUARD_UPSTREAM  the socket (/var/run/docker.sock)
//   GUARD_PORT     2375
import { createGuard } from '../src/docker-guard-server.ts';

const { GUARD_IMAGE = '', GUARD_VOLUME = '', GUARD_NETWORKS = '', GUARD_UPSTREAM = '/var/run/docker.sock', GUARD_PORT = '2375' } = process.env;
if (!GUARD_IMAGE || !GUARD_VOLUME) {
  console.error('GUARD_IMAGE and GUARD_VOLUME are required: without them nothing could be created.');
  process.exit(1);
}
const networks = GUARD_NETWORKS.split(',').map((n) => n.trim()).filter(Boolean);
createGuard({ image: GUARD_IMAGE, volume: GUARD_VOLUME, networks }, GUARD_UPSTREAM, (line) => console.error(line))
  .listen(Number(GUARD_PORT), '0.0.0.0', () => console.error(`docker guard on :${GUARD_PORT} for ${GUARD_IMAGE}`));
