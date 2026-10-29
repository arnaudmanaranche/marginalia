# Architecture

Target architecture for V2. Terms are defined in `GLOSSARY.md`; the reasons are in `docs/adr/`. Step 2 of the delivery order has moved the code into `api/src` (with the HTTP routes in `api/src/http`) and `ui/`. `packages/contract` is in place as a workspace (the schemas, split in eight modules) but `api/` and `ui/` are not yet workspaces, and the `.ts` migration is not done; where this file says so, it describes where the code is going.

## Packages

npm workspaces at the repo root:

| Package | Holds | May import |
| --- | --- | --- |
| `packages/contract` | zod schemas and the types derived from them: the review, the HTTP request and response shapes | nothing in the repo |
| `api/` | the bot: intake, poller, runs, guardrails, GitLab client, HTTP routes, SQLite | `contract` |
| `ui/` | the studio (React, Vite, Tailwind) | `contract` (types and schemas only), never `api/` |

`api/` is the only thing that touches GitLab, git, `claude` or the database. `ui/` reaches them through HTTP, in one place (`ui/src/api`). `api/` serves the built `ui/dist` when packaged.

## Listeners

- **Studio listener**: the studio and its HTTP API. Local mode binds `127.0.0.1`. Hosted mode sits behind HTTPS and GitLab OAuth.
- **Webhook listener**: separate port, one route, `POST /webhooks/gitlab`. Compares `X-Gitlab-Token` in constant time before parsing the body, answers 200 at once and enqueues. Only `Note Hook` is handled. With no secret configured it does not start.

## Run flow

```
studio click ─┐
mention ──────┤ intake (webhook | polling) → one mention record
              ▼
        guardrails: Developer+ member? not a bot note? note id unseen?
                    one run per MR (extra mentions queue as one follow-up), daily cap
              ▼
        run: ephemeral worktree, read-only token, tool allowlist,
             agent picks skills from the catalog and works freely
              ▼
        guardrail: result validated against the contract  ── invalid → visible failure, nothing posted
              ▼
        review stored → studio  |  bot account replies (mention)  |  click-to-post under the person's token
```

## Skills

1. `marginalia-review`: the contract skill. Always loaded. The one place the format is written for the agent.
2. Global built-ins: `pr-hygiene`, `correctness`, `security`, `tests`, `maintainability`, `compatibility`, `performance`. Stack-agnostic.
3. Team skills from the reviewed repo's `.claude/`. They win over a built-in of the same name.

The agent sees one merged catalog (name and a one-line "use when" description) and picks. Marginalia has no per-project skill list and no knowledge of any stack.

## Credentials

- Claude: one `ANTHROPIC_API_KEY` per hosted instance. Local mode uses the developer's own `claude` login.
- GitLab read (`read_api`, `read_repository`): the bot account's token, for cloning and reading. The agent process gets a checkout and no token.
- GitLab write: held only by `api/`, used after validation to reply and to post drafts.
- Click-to-post: the signed-in person's OAuth token.

## Storage

SQLite on a persistent volume, one instance. Postgres is the step if more than one instance is ever needed.

## Delivery order

1. Docs and rules. 2. Mechanical restructure, no behavior change: `lib/` to `api/src`, the studio server to `api/src/http`, `studio/` to `ui/` (done); workspaces and `packages/contract` (next). 3. `.mjs` to `.ts` together with the `tsc` build and strict typing, since Node cannot run `.ts` without the build. 4. Contract, guardrails and catalog, with evals from here on. 5. Mention intake: polling, then webhook, then bot replies. 6. Hosted: OAuth, click-to-post, Docker/HTTPS recipe. A migration covers the V1 `.env`, `posted.json`, `runs.jsonl`, `state.json` and `marginalia.db`.

## Tests

1. Deterministic, in `npm test`: contract fixtures (valid pass, invalid are rejected and never posted), catalog override, authorization, bot-note and duplicate-note cases.
2. Flow, in `npm test`: mention to post against the in-memory GitLab adapter with a scripted fake in place of `claude`, including garbage output.
3. Eval, `npm run eval`, manual and before a release: seeded MRs with a planted problem each. Checks that the output validates, the planted problem is found at the right file and line, and a clean MR has no Critical finding.
