# Architecture

Target architecture for V2. Terms are defined in `GLOSSARY.md`; the reasons are in `docs/adr/`. Step 2 of the delivery order is done: the repo is an npm workspace of `packages/contract` (the HTTP schemas, in eight modules), `api/` (the bot: `src`, `src/http`, `bin`, `scripts`, `docker`, `skills`, `examples`, `swiftbar`, `test`) and `ui/`. `scripts/check-file-size.mjs` stays at the root as repo tooling. The `.ts` migration (step 3) is under way: the code is TypeScript and builds to `dist/`, with `strictNullChecks` and `noImplicitAny` still to turn on.

## Packages

npm workspaces at the repo root:

| Package | Holds | May import |
| --- | --- | --- |
| `packages/contract` | zod schemas and the types derived from them: the review, the HTTP request and response shapes | nothing in the repo |
| `api/` | the bot: intake, poller, runs, guardrails, GitLab client, HTTP routes, SQLite | `contract` |
| `ui/` | the studio (React, Vite, Tailwind) | `contract` (types and schemas only), never `api/` |

`api/` is the only thing that touches GitLab, git, `claude` or the database. `ui/` reaches them through HTTP, in one place (`ui/src/api`). `api/` serves the built studio: `ui/dist` in the repo, `api/ui-dist` in a packaged install (`prepack` copies it).

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

1. Docs and rules. 2. Mechanical restructure, no behavior change: `lib/` to `api/src`, the studio server to `api/src/http`, `studio/` to `ui/` and the three workspaces with their own `package.json` (done). A clone keeps its `.env` and state files at the repo root. The contract is published as `@worldia/marginalia-contract` next to the bot, with the same version. 3. `.mjs` to `.ts` together with the `tsc` build (renamed and building), then `strictNullChecks` and `noImplicitAny`, since Node cannot run `.ts` without the build. 4. Contract, guardrails and catalog, with evals from here on. 5. Mention intake: polling, then webhook, then bot replies. 6. Hosted: OAuth, click-to-post, Docker/HTTPS recipe. A migration covers the V1 `.env`, `posted.json`, `runs.jsonl`, `state.json` and `marginalia.db`.

## Tests

1. Deterministic, in `npm test`: contract fixtures (valid pass, invalid are rejected and never posted), catalog override, authorization, bot-note and duplicate-note cases.
2. Flow, in `npm test`: mention to post against the in-memory GitLab adapter with a scripted fake in place of `claude`, including garbage output.
3. Eval, `npm run eval`, manual and before a release: seeded MRs with a planted problem each. Checks that the output validates, the planted problem is found at the right file and line, and a clean MR has no Critical finding.
