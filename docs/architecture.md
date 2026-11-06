# Architecture

How Marginalia is built. Terms are defined in `GLOSSARY.md`; the reasons are in `docs/adr/`. The repo is an npm workspace of `packages/contract` (the HTTP schemas, in eight modules), `api/` (the bot: `src`, `src/http`, `bin`, `scripts`, `docker`, `skills`, `examples`, `swiftbar`, `test`) and `ui/`. `scripts/check-file-size.mjs` stays at the root as repo tooling. The code is TypeScript, builds to `dist/` with `tsc` and is `strict` with `noImplicitAny` (ADR 0005).

## Factory

Marginalia is a software factory (ADR 0006). A **line** is one kind of job on one project, and a **job** is one execution of a line on one target. Review is the first line and is the run flow below. Each job reads the project's approved **project context** (glossary, stack, features, critical paths, every item cited), which is learned by an Understand job (`api/src/understand.ts`, method in `api/jobs/understand.md`, its own worktree at the default branch) and stored outside the reviewed repo in `<data dir>/context/`: `<key>.draft.json` until a person approves it, `<key>.json` after (`api/src/context-store.ts`). The shape is `AgentProjectContext` in `packages/contract`, checked by the same guardrail as a review. Sharing it through the team repo comes later. During a run the agent reads Jira, Notion, Slack and PostHog with read-only access. Writes wait for an approval in the studio, except a mention reply. Nothing in the code names a stack. Every job is a run in the journal (`<data dir>/runs/<project>/<review>/<id>.json`), the Understand job included (`<key>/_context`); `GET /api/jobs` lists them across projects, newest first, and the studio's Home feed shows them live (ADR 0007). A project's context is read, approved and learned again from the studio (`#/context:<key>`, `GET /api/projects/<key>/context`, `POST .../context/approve`, `POST .../understand`); Home says when a draft waits for approval. The approvals inbox (`#/approvals`, `GET /api/approvals`) lists every comment proposed on someone else's MR that is neither added to a review nor dismissed; adding one goes through the same preview and `POST /api/post` as the review page, and `POST /api/dismiss` records a no (table `dismissed`), never sending anything. The review line's measure (`GET /api/lines/review/metrics`, the card in Home's Activity) is computed locally over 28 days: the review line's jobs (reviews of other people's MRs and your own reviews, the latter also counted apart), failures, median run, cost, and the comments posted as proposed, edited first, dismissed or still waiting, plus the findings of your own reviews that a later push fixed (`own-fixed.ts`: when an own review is made again at a new commit, the old review's findings whose line that push changed, read from `git diff -U0`, are recorded once in `fixed_before`).

## Packages

npm workspaces at the repo root:

| Package | Holds | May import |
| --- | --- | --- |
| `packages/contract` | zod schemas and the types derived from them: the review, the HTTP request and response shapes | nothing in the repo |
| `api/` | the bot: intake (webhook and polling), runs, guardrails, GitLab client, HTTP routes, SQLite | `contract` |
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

Every review and triage is Marginalia's staged pipeline (`api/src/pipeline/`, ADR 0008). Skills are **lenses** of a review's chapters:

1. Global built-ins: `pr-hygiene`, `correctness`, `security`, `tests`, `maintainability`, `compatibility`, `performance`, `critical-path-impact` (maps the diff to the approved project context's critical paths). Stack-agnostic.
2. Team skills from the team repo (`<data dir>/team/skills`). They win over a built-in of the same name.

`api/src/catalog.ts` plans the merge and `catalog-assemble.ts` builds `<data dir>/catalog`, a read-only plugin named `marginalia` passed with `--plugin-dir` to each chapter's reviewer, which loads the lenses its files call for with the Skill tool. Marginalia has no per-project skill list and no knowledge of any stack.

A review is also told the project's approved context, inline (`api/src/context-prompt.ts`), and `REVIEW_PROMPT_EXTRA`; the review names the critical paths it touches in `criticalPaths`. Without an approved context nothing changes.

## Credentials

- Claude: one `ANTHROPIC_API_KEY` per hosted instance. Local mode uses the developer's own `claude` login.
- GitLab read (`read_api`, `read_repository`): the bot account's token, for cloning and reading. The agent process gets a checkout and no token.
- GitLab write: held only by `api/`, used after validation to reply and to post drafts.
- Click-to-post: the signed-in person's OAuth token.
- Connectors: a run reads GitLab, Jira (Atlassian v2), Notion and Slack through the claude.ai connectors of the logged-in account, read tools only (`api/src/connector-tools.ts`). A connector write tool is refused even when a config lists it. PostHog has no read-only tool, so the agent gets PostHog data from the bot. The preflight and `marginalia doctor` say which connectors are missing, and a run goes on without them.

## Queue

Every poll, webhook mention, Understand job and "Review again" from the studio (`rerun.ts`) is a task in the `task` table (`api/src/queue.ts`, rules in `queue-plan.ts`, queries in `queue-store.ts`). Each task belongs to a project, its lane: two tasks of one project never run together, since they share its bot worktree and state, and up to `QUEUE_WORKERS` projects (2 by default) run side by side. A poll is one task per project. The next task is a person's request before a poll, then the oldest. `status.json` lists every MR under review in `running`, one per project; `current` is the latest, for the menu bar. A poll asked while one waits joins it, so "Poll now" and "Review again" never answer that the bot is busy. A task left running by a stopped process is queued again once, then fails. The last 200 finished tasks are kept. The CLI's `marginalia understand` runs its job directly, in its own process.

Every Claude run writes a row with its cost in the `run` table. The daily budget (`budget.ts`, read by `budget-today.ts`) adds up today's rows against `DAILY_BUDGET_USD`; once it is reached, a pass leaves its automatic work waiting (`poll-pass-mr.ts`), except the MR a "Review again" task names. `GET /api/queue` carries the budget, so the studio shows it beside the queue.

## Storage

SQLite on a persistent volume, one instance. Postgres is the step if more than one instance is ever needed.

## How it was delivered

Every step is done. A clone keeps its `.env` and state files at the repo root, and the contract is published as `@worldia/marginalia-contract` next to the bot, with the same version.

1. Docs and rules, then the three workspaces (`api/`, `ui/`, `packages/contract`) with their own `package.json`, then `.mjs` to `.ts` with the `tsc` build.
2. Contract, guardrails and catalog, with evals from here on (the strict `AgentReview`/`AgentTriage` schemas and `api/src/guardrail.ts` fail a command run whose findings file breaks them, the catalog with the seven built-ins is loaded into runs, `api/test/flow-contract.test.mjs` runs a command with a scripted fake `claude`, and `npm run eval` reviews the seeded cases in `api/evals/cases` with the real one).
3. Mention intake: polling, then webhook, then bot replies (polling and replies are done: `api/src/mention-pass.ts` runs after each project's pass, reads the notes since its cursor, applies `mention-guardrail.ts` and answers in the thread; the webhook listener is `webhook-server.ts`, started by `webhook-intake.ts` when `WEBHOOK_SECRET` is set, and its mentions are tasks of the same queue as the poll, so nothing overlaps). A mention run does not show live in the studio's status yet.
4. Hosted: OAuth, click-to-post, Docker/HTTPS recipe (done: `api/src/auth*.ts` and `http/auth-*.ts` for the login, `http/request-scope.ts` for the person's projects and token, `compose.hosted.yaml` and `docs/reference/hosting.md`). `marginalia migrate` covers the `.env`, `posted.json`, `runs.jsonl`, `state.json` and `marginalia.db`.

## Tests

1. Deterministic, in `npm test`: contract fixtures (valid pass, invalid are rejected and never posted), catalog override, authorization, bot-note and duplicate-note cases.
2. Flow, in `npm test`: mention to post against the in-memory GitLab adapter with a scripted fake in place of `claude`, including garbage output.
3. Eval, `npm run eval`, manual and before a release: seeded MRs with a planted problem each. Checks that the output validates, the planted problem is found at the right file and line, and a clean MR has no Critical finding.
