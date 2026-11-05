# Architecture

Target architecture for V2. Terms are defined in `GLOSSARY.md`; the reasons are in `docs/adr/`. Step 2 of the delivery order is done: the repo is an npm workspace of `packages/contract` (the HTTP schemas, in eight modules), `api/` (the bot: `src`, `src/http`, `bin`, `scripts`, `docker`, `skills`, `examples`, `swiftbar`, `test`) and `ui/`. `scripts/check-file-size.mjs` stays at the root as repo tooling. The `.ts` migration (step 3) is done: the code is TypeScript, builds to `dist/` and is `strict` with `noImplicitAny`.

## Factory

Marginalia is a software factory (ADR 0006). A **line** is one kind of job on one project, and a **job** is one execution of a line on one target. Review is the first line and is the run flow below. Each job reads the project's approved **project context** (glossary, stack, features, critical paths, every item cited), which is learned by an Understand job (`api/src/understand.ts`, method in `api/jobs/understand.md`, its own worktree at the default branch) and stored outside the reviewed repo in `<data dir>/context/`: `<key>.draft.json` until a person approves it, `<key>.json` after (`api/src/context-store.ts`). The shape is `AgentProjectContext` in `packages/contract`, checked by the same guardrail as a review. Sharing it through the team repo comes later. During a run the agent reads Jira, Notion, Slack and PostHog with read-only access. Writes wait for an approval in the studio, except a mention reply. Nothing in the code names a stack.

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
2. Global built-ins: `pr-hygiene`, `correctness`, `security`, `tests`, `maintainability`, `compatibility`, `performance`, `critical-path-impact` (maps the diff to the approved project context's critical paths). Stack-agnostic.

A review run is also told the project's approved context, inline (`api/src/context-prompt.ts`), in both the command path and the staged pipeline; the review names the critical paths it touches in `criticalPaths`. Without an approved context nothing changes.
3. Team skills from the reviewed repo's `.claude/`. They win over a built-in of the same name.

The agent sees one merged catalog (name and a one-line "use when" description) and picks. `api/src/catalog.ts` plans the merge (a team skill replaces a built-in of the same name, never the contract skill) and `catalog-assemble.ts` builds `<data dir>/catalog`, a read-only plugin named `marginalia` passed to every command run with `--plugin-dir`. Marginalia has no per-project skill list and no knowledge of any stack.

## Credentials

- Claude: one `ANTHROPIC_API_KEY` per hosted instance. Local mode uses the developer's own `claude` login.
- GitLab read (`read_api`, `read_repository`): the bot account's token, for cloning and reading. The agent process gets a checkout and no token.
- GitLab write: held only by `api/`, used after validation to reply and to post drafts.
- Click-to-post: the signed-in person's OAuth token.
- Connectors: a run reads GitLab, Jira (Atlassian v2), Notion and Slack through the claude.ai connectors of the logged-in account, read tools only (`api/src/connector-tools.ts`). A connector write tool is refused even when a config lists it. PostHog has no read-only tool, so the agent gets PostHog data from the bot. The preflight and `marginalia doctor` say which connectors are missing, and a run goes on without them.

## Storage

SQLite on a persistent volume, one instance. Postgres is the step if more than one instance is ever needed.

## Delivery order

1. Docs and rules. 2. Mechanical restructure, no behavior change: `lib/` to `api/src`, the studio server to `api/src/http`, `studio/` to `ui/` and the three workspaces with their own `package.json` (done). A clone keeps its `.env` and state files at the repo root. The contract is published as `@worldia/marginalia-contract` next to the bot, with the same version. 3. `.mjs` to `.ts` together with the `tsc` build (done, `strict` with `noImplicitAny`), since Node cannot run `.ts` without the build. 4. Contract, guardrails and catalog, with evals from here on (done: the strict `AgentReview`/`AgentTriage` schemas and `api/src/guardrail.ts` fail a command run whose findings file breaks them, the catalog with the seven built-ins is loaded into runs, `api/test/flow-contract.test.mjs` runs a command with a scripted fake `claude`, and `npm run eval` reviews the seeded cases in `api/evals/cases` with the real one). 5. Mention intake: polling, then webhook, then bot replies (polling and replies are done: `api/src/mention-pass.ts` runs after each project's pass, reads the notes since its cursor, applies `mention-guardrail.ts` and answers in the thread; the webhook listener is `webhook-server.ts`, started by `webhook-intake.ts` when `WEBHOOK_SECRET` is set, and it shares `serial.ts` with the poll so nothing overlaps). A mention run does not show live in the studio's status yet. 6. Hosted: OAuth, click-to-post, Docker/HTTPS recipe (done: `api/src/auth*.ts` and `http/auth-*.ts` for the login, `http/request-scope.ts` for the person's projects and token, `compose.hosted.yaml` and `docs/reference/hosting.md`). A migration covers the V1 `.env`, `posted.json`, `runs.jsonl`, `state.json` and `marginalia.db`.

## Tests

1. Deterministic, in `npm test`: contract fixtures (valid pass, invalid are rejected and never posted), catalog override, authorization, bot-note and duplicate-note cases.
2. Flow, in `npm test`: mention to post against the in-memory GitLab adapter with a scripted fake in place of `claude`, including garbage output.
3. Eval, `npm run eval`, manual and before a release: seeded MRs with a planted problem each. Checks that the output validates, the planted problem is found at the right file and line, and a clean MR has no Critical finding.
