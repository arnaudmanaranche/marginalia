# syntax=docker/dockerfile:1
#
# Marginalia in a container: the poller, the studio and the `claude` CLI, with nothing of
# yours baked in (no .env, no tokens, no state). Everything personal is mounted at run time:
#   /data              config.json, marginalia.db, status, the team copy  (a volume)
#   /home/node/.claude the claude login                                   (a volume)
#   /repos             your checkouts of the repos to review              (bind mount)
# See "Run in a container" in the README.

# --- the React app, built once
FROM node:22-bookworm-slim AS studio
WORKDIR /studio
COPY studio/package.json studio/package-lock.json ./
RUN npm ci
COPY studio/index.html studio/tsconfig.json studio/vite.config.ts ./
COPY studio/public ./public
COPY studio/src ./src
RUN npm run build

# --- production dependencies of the server side
FROM node:22-bookworm-slim AS deps
WORKDIR /app
COPY package.json package-lock.json ./
RUN npm ci --omit=dev

# --- what runs
FROM node:22-bookworm-slim
# The version of the CLI the bot was tried with; bump it on purpose (--build-arg to try another).
ARG CLAUDE_CODE_VERSION=2.1.306
RUN apt-get update \
 && apt-get install -y --no-install-recommends git openssh-client ca-certificates tini \
 && rm -rf /var/lib/apt/lists/* \
 && npm install -g "@anthropic-ai/claude-code@${CLAUDE_CODE_VERSION}" \
 && npm cache clean --force \
 && git config --system --add safe.directory '*'

WORKDIR /app
COPY --from=deps /app/node_modules ./node_modules
COPY package.json poll.mjs .env.example ./
COPY bin ./bin
COPY lib ./lib
COPY scripts ./scripts
COPY docker ./docker
COPY skills ./skills
COPY examples ./examples
COPY studio/*.mjs ./studio/
COPY --from=studio /studio/dist ./studio/dist
RUN chmod +x docker/entrypoint.sh docker/git-https.mjs \
 && mkdir -p /data /home/node/.claude /repos \
 && chown node:node /data /home/node/.claude /repos

# The OS sandbox of the bot is macOS-only: here the container is the boundary (see doctor).
# The studio has no login and listens on all interfaces INSIDE the container: publish its port
# on 127.0.0.1 only (compose.yaml does).
ENV NODE_ENV=production \
    MARGINALIA_HOME=/data \
    MARGINALIA_CONTAINER=1 \
    CLAUDE_SANDBOX=false \
    CLAUDE_CONFIG_DIR=/home/node/.claude \
    GIT_CONFIG_GLOBAL=/data/gitconfig \
    STUDIO_HOST=0.0.0.0 \
    STUDIO_PORT=4477

USER node
VOLUME ["/data", "/home/node/.claude"]
EXPOSE 4477
HEALTHCHECK --interval=30s --timeout=5s --start-period=20s --retries=3 \
  CMD node -e "fetch('http://127.0.0.1:'+process.env.STUDIO_PORT+'/openapi.json').then((r)=>process.exit(r.ok?0:1),()=>process.exit(1))"

ENTRYPOINT ["/usr/bin/tini", "--", "/app/docker/entrypoint.sh"]
CMD ["start"]
