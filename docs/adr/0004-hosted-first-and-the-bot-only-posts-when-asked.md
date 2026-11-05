# 0004. Hosted first, and the bot only posts when asked

Status: accepted, 2026-10-29

Posting: the bot posts only when a person asked, by mentioning it or by clicking. A mention is the request, so the bot account replies in the thread, with inline comments as GitLab drafts. A studio click posts under the clicking person's own OAuth token after they edited the comment. The bot never reviews and posts unprompted.

Who may trigger: only Developer+ project members. The bot ignores bot notes, drops a note id it has seen, runs one run per MR (further mentions queue as one follow-up) and has a daily cap per project. MR content is untrusted data.

Hosting: the team's shared instance on company infra (HTTPS, GitLab OAuth for the studio, a bot account for replies, SQLite on a volume, one instance) is the primary target. Local single-user mode is the same code with polling, no OAuth, `127.0.0.1` and the developer's own `claude` login. SwiftBar, autostart and desktop notifications are optional local helpers. Postgres is the step if more than one instance is needed.

Webhook: a separate listener, one route `POST /webhooks/gitlab`, `X-Gitlab-Token` compared in constant time before parsing, `Note Hook` only, answers 200 and enqueues. It shares nothing with the studio listener.

Credentials: one `ANTHROPIC_API_KEY` per hosted instance. The bot account's read token (`read_api`, `read_repository`) clones; the agent environment holds no GitLab token. Only `api/` holds the write token. Each run gets an ephemeral worktree.
