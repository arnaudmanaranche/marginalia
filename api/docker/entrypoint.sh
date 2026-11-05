#!/bin/sh
# `docker run <image> <command>` is `marginalia <command>` (start, init, doctor, sync, ...).
# `claude`, `git`, `sh` and `node` run as themselves, e.g. `docker run -it <image> claude login`.
set -e

# Reach GitLab over HTTPS with the token (docker/git-https.mjs), since SSH keys are a nuisance
# in a container. Set MARGINALIA_GIT_SSH=1 to keep SSH and mount your own keys instead.
if [ "${MARGINALIA_GIT_SSH:-0}" != "1" ]; then
  node /app/api/docker/git-https.mjs setup || true
fi

# The triage commits its fixes locally, which git refuses without an identity. Set one unless
# /data/gitconfig already has it; MARGINALIA_GIT_NAME / MARGINALIA_GIT_EMAIL choose it.
git config --global user.name >/dev/null 2>&1 || git config --global user.name "${MARGINALIA_GIT_NAME:-Marginalia}"
git config --global user.email >/dev/null 2>&1 || git config --global user.email "${MARGINALIA_GIT_EMAIL:-marginalia@localhost}"

# Claude ignores a folder's own settings until it is trusted; nobody can answer that dialog here
# (docker/trust.mjs trusts the repos of your config.json; MARGINALIA_TRUST_REPOS=0 turns it off).
node /app/api/docker/trust.mjs || true

case "${1:-}" in
  claude|git|sh|bash|node) exec "$@" ;;
  *) exec node /app/api/dist/bin/marginalia.js "$@" ;;
esac
