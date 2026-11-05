# 0001. `api/` and `ui/` are separate packages linked by a contract

Status: accepted, 2026-10-29

The studio server sat next to the React app and imported from `lib/` directly. V2 has two entry points (studio and mention) and can run local or hosted, so the line between the bot and the screen must be real.

Decision: npm workspaces `packages/contract`, `api/`, `ui/`. `api/` is the only code that touches GitLab, git, `claude` or the database. `ui/` talks to it over HTTP through one client and imports only types and schemas from `contract`. A lint rule forbids `ui/` importing `api/`.

Consequence: the UI can point at a local or a hosted `api/`. The `lib/` size rule moves to `api/`; `ui/` has its own (200 lines per component).
