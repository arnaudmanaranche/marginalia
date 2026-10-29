# Marginalia — rules for AI agents

Marginalia is a bot that reviews GitLab merge requests and a studio to read the reviews. V2 is
moving the code into `api/` (bot), `ui/` (studio) and `packages/contract`. Read these first:

- `GLOSSARY.md`: the words to use. A new concept gets an entry before it gets a name in code.
- `PRODUCT.md`: what it is and the promises that must not break.
- `docs/architecture.md`: packages, listeners, run flow, skills, delivery order.
- `docs/guidelines/api.md` and `docs/guidelines/ui.md`: how code is written on each side.
- `docs/adr/`: why each decision was made. `DESIGN.md`: how the studio looks.

## Always

- The bot only posts when a person mentioned it or clicked. Only `api/` holds the GitLab write
  token; the agent never gets one. Nothing that fails the contract is shown or posted.
- `ui/` never imports from `api/`; the link is `packages/contract` and HTTP.
- Mechanical changes (renames, moves) never share a commit with behavior changes.

## Module size

- No module in `api/src` may exceed **150 lines** (`MAX_LINES` in
  `scripts/check-file-size.mjs`); components in `ui/` stay under 200. `OVER_LIMIT` in that script lists three
  server files that arrived over the limit; it only shrinks, never add to it.
- Enforced three ways: a `PostToolUse` hook (`.claude/settings.json`) that rejects an edit leaving
  a file over the limit, `test/file-size.test.mjs` in `npm test`, and `npm run check:size`.
- Near the limit, split by responsibility rather than compacting: pure logic in its own module
  with no config or I/O import, requests and side effects in another. Do not raise the limit to
  make a change fit.
- Import a function from the module that defines it; only `findings.mjs` re-exports, as the
  public entry point of the findings shape.
