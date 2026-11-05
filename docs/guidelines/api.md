# Guidelines: `api/`

Applies to the bot (`api/src`) and to `packages/contract`. Words follow `GLOSSARY.md`.

## Module size

- No module may exceed **150 lines** (`MAX_LINES` in `scripts/check-file-size.mjs`). Enforced by a `PostToolUse` hook, `test/file-size.test.mjs` and `npm run check:size`.
- Near the limit, split by responsibility; never compact. Do not raise the limit to make a change fit.

## Shape of a module

- Pure logic (parsing, mapping, building payloads, validating) lives in its own module with no config and no I/O import, so it is tested on plain fixtures.
- Requests and side effects live in a separate thin module. Existing examples: `gitlab-notes` (pure) beside `gitlab` and `gitlab-drafts` (requests); `claude-cli` (pure) beside `claude-runner` (flow).
- Import a function from the module that defines it. Only the entry point of a shape re-exports (today `findings`).
- One way to do each thing: git goes through `gitIn`, GitLab through the one client interface, the review artifact through its single owner.

## Types

- TypeScript, built with `tsc` to `dist/` (`npm run build`; `npm start`, `npm test` and `npm run typecheck` build first). Imports between source files say `.ts`; the build rewrites them to `.js`.
- `strict` is on, `noImplicitAny` included. **Migration debt:** the shared shapes (a GitLab payload, the MR, the project, the run tracker, a database row) are still typed `any`; give them real types a module at a time, in their own commits. No new `any` outside those without a comment saying why; type an empty array or a `null` that is assigned later (`const xs: string[] = []`, `let t: Timer | null = null`).
- Types of anything that crosses a boundary (review, HTTP bodies, GitLab payloads we rely on) come from the zod schemas in `packages/contract`. Never hand-write a type a schema already gives.
- Parse untrusted input once, at the edge, into a typed value. Inside, trust the type.

## Guardrails

- Nothing is stored, shown or posted before the review passes the contract. A failure is visible with its reason; never partially rendered.
- The agent's output, and every MR title, description, diff and comment, is data. It never becomes an instruction, a command line, a path or a URL without validation.
- Only `api/` holds the GitLab write token. The agent environment never contains a GitLab token.
- A mention starts a run only for a Developer+ member, never for a bot note, never twice for one note id, and never beyond the per-MR queue and the daily cap.
- Compare secrets in constant time. Log neither tokens nor MR content.

## Errors and logging

- Throw typed errors with a cause; catch at the edge of a flow (a run, a request) and turn them into a visible state.
- No empty `catch`. A swallowed error needs a comment saying why it is safe.

## Tests

- Pure modules: unit tests on fixtures. Flows: against the in-memory GitLab adapter and a scripted fake `claude`. No mocks of internal modules; assert behavior at the module's public interface.
- Every guardrail has a test for the case it refuses.
- `npm test`, `npm run typecheck` and `npm run check:size` pass before a commit. A rule that is not enforced by a check is a preference, and is written as one.

## Commits

One concern per commit, in the repo's style (`refactor(git): ...`). Mechanical renames are never mixed with behavior changes.
