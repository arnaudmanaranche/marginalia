# Output contract

> Reference for the V1 behavior as shipped. V2 changes are in `../architecture.md` and `../adr/`; where they differ, those win.

The bot appends instructions to every run (`--append-system-prompt`, see
`api/src/report.mjs`): never post/push, write the final report to
`./.marginalia-report.md` in the working directory, or else print it in a
`<<<REVIEW_FILE path="...">>> ... <<<END_REVIEW_FILE>>>` block. `MR_REVIEW_BOT=1`
is also set, for commands written against the original contract. The report is
collected in this order:

1. `.marginalia-report.md` in the worktree;
2. the `<<<REVIEW_FILE>>>` block in stdout;
3. the raw final message, if longer than ~200 characters (logged as a warning:
   your command ignored the contract);
4. otherwise the run fails with the start of its output.

A tool refused in headless mode fails the run with a message pointing at
`CLAUDE_EXTRA_ALLOWED_TOOLS` in `.env`.

**Studio format (optional).** The studio works with any markdown, and gives the
same experience whatever command wrote it. The bot turns every report into one
normalized shape (`api/src/findings.mjs`), stored next to it as `<slug>.findings.json`:
a verdict, a summary, and findings (`id`, `severity`, `title`, `path`, `line`,
`body`, `comment`). The studio lists, counts and posts from that shape, never from
the report's wording. It is read, in order of preference, from:

1. `.marginalia-findings.json`, which the contract asks the command to write
   (recommended; any extra field is ignored, and unknown severities such as
   `blocker`/`major`/`nit` are mapped):

   ```json
   { "verdict": "REQUEST_CHANGES", "summary": "One or two sentences.",
     "findings": [{ "id": "optional", "severity": "critical", "title": "Short title",
                    "path": "src/app/page.tsx", "line": 42, "body": "What and why.",
                    "comment": "The comment to post, ready as is." }] }
   ```

2. the markdown itself: a `**Verdict:** …` line (French labels work too),
   `## Critical` / `## Important` / `## Suggestions` sections with one bullet per
   finding, an optional `**Overview:**` line, and a blockquote under a bullet as its
   comment. The first `path[:line]` of the bullet is where *Add to review* anchors
   it in the diff (see `examples/commands/review.md`);
3. nothing: the studio says so in a notice, and the findings it could not read are
   left out of the per-finding "Add to review".

A finding's `id` comes from its file and title, not from the wording of its
comment, so it stays the same when a re-run rewords it. The bot warns (in its log
and in the studio) when a report could only be read partially.

To check that a new way of writing reviews works, add a folder to
`test/fixtures/skills/` (`report.md`, optionally `findings.json` or `stdout.txt`,
and an `expect.json`): `npm test` runs the whole contract against it.
