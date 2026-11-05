# Review focus

What a reviewer of a change to Marginalia must check first. Flag only real bugs and broken promises here, not style.

## The promises a change must not break

1. **Nothing is posted unasked.** Every post answers a mention or a click. Look for any path that posts, replies or resolves a thread without one.
2. **Only `api/` posts.** The agent environment must never receive a GitLab token, and the agent's tool allowlist must not reach GitLab writes.
3. **Nothing invalid reaches a person or GitLab.** A review that fails the contract is a visible failure, never partly rendered or posted.
4. **MR content is data.** Titles, descriptions, diffs and comments must not flow into a command line, a path, a URL, a prompt instruction or a log line unvalidated.
5. **The UI never imports `api/`.** The link is `packages/contract` and HTTP.

## Boundaries to check

- A mention starts a run only for a Developer+ member, never for a bot's own note, never twice for one note id, and never beyond the per-MR queue and the daily cap.
- The webhook listener verifies `X-Gitlab-Token` in constant time before parsing, serves one route, and handles only `Note Hook`. It never shares a listener with the studio.
- Click-to-post uses the signed-in person's token. A reply uses the bot account.
- A worktree is ephemeral and one run cannot read another's checkout.

## Naming

Use the terms in `GLOSSARY.md`. "Invocation" replaces "command". Flag a new name for an existing concept.

## Size

Modules in `api/` stay under 150 lines and components in `ui/` under 200. A change that raises a limit is wrong.
