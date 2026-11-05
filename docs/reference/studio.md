# Review studio

> Reference for the V1 behavior as shipped. V2 changes are in `../architecture.md` and `../adr/`; where they differ, those win.

**Marginalia** is the local reader for the generated reviews, at `http://localhost:4477`
(`STUDIO_PORT`, bound to `127.0.0.1`, read-only). Vite + React + Tailwind
front end (`ui/`), served as static files by `api/src/http/server.mjs`, which
`poll.mjs` starts at boot. Home lists the reviews as rows grouped by whose turn it is, read from GitLab and not from what this
browser has opened: *Needs your first review* (you have not reviewed it on GitLab), *Returned to you*
(the author pushed or answered after your review), *Review to send* (your comments wait in a pending
review), *Comments on your merge requests*, *Waiting on others* and, folded, *Done*. The poll reads
that standing for each MR (your notes, your approval or request for changes, pushes, open threads,
your drafts) and the studio refreshes the one MR right after you post, submit or delete a draft. A row
shows the author, what you decided, the Critical / Important counts, the risk, the verdict and the age (most urgent Jira ticket first when all three `JIRA_*` are
set in `.env`; `JIRA_BASE_URL` alone only links the ticket, newest first otherwise). A review opens as a
guided tour with its diff, has a copy button on the "Comment to post" blocks, and
a `⌘K` search. It refreshes live when a review file or `status.json` changes.

```bash
npm run studio:install   # once
npm run studio:build     # after any change under ui/src
npm run studio:dev       # Vite dev server with hot reload (bot must be running)
npm run dev              # bot + Vite dev server in one terminal; Ctrl+C stops both
```

`npm run dev` starts its own bot: stop the background one first
(`npm run autostart -- --uninstall`, or `pm2 stop marginalia`), or both will poll and the second can't bind the studio port.

The poll interval can be changed from the studio's top bar ("Poll every…").
It's saved to `settings.json` (gitignored) and overrides `POLL_INTERVAL_MINUTES`,
which stays the default. No restart: the bot re-arms its pending timer right
away. This is the studio's only write endpoint (`PUT /api/settings`); it
refuses requests whose `Host` or `Origin` isn't the studio itself.

**Posting on other people's MRs (opt-in).** With `ALLOW_POSTING=true` in `.env`, each "Comment to post"
block gets an *Add to review* button. It opens a confirmation showing the final
(possibly edited) text and the target MR, then creates a GitLab **draft note**
(inline on the file/line when it can, else general) through the API with your
`GITLAB_TOKEN`. Drafts are private to you: nothing is visible to the MR author
until the *Submit review (N)* button, which asks for an optional summary and
publishes everything as one real GitLab review (`draft_notes/bulk_publish`; drafts
started in GitLab's own UI are published too). The MR is resolved server-side from
`status.json`, never from the request. Comments are remembered in `posted.json`
(gitignored) so the same one can't be added twice, and shown with an "In pending
review" then "Posted" badge. Off by default: without the flag the buttons don't
exist and `POST /api/post` and `POST /api/submit-review` answer 403 for a review.
Your own MRs are not behind the flag: there you reply and push (see the triage above).

**Design system (Scholia).** The studio's UI is documented in Storybook:
`npm run studio:storybook` (port 6006). It holds the foundations from `DESIGN.md`
(colours, type, radii, spacing) and a story per presentational component. Light and dark
follow the OS, as in the app. `npm --prefix ui run build-storybook` builds a static copy
(`ui/storybook-static`, gitignored).

**API contract.** The server is a Hono app (`api/src/http/app.mjs`, routes in `api/src/http/routes-*.mjs`).
Every request body is validated with the zod schemas in `packages/contract/src` (`@worldia/marginalia-contract`), and the OpenAPI 3.1
document is generated from those same schemas: with the studio running, read it at
<http://localhost:4477/openapi.json>, rendered at <http://localhost:4477/api-docs.html> (read-only:
"Try it out" is off, since the write endpoints post to GitLab as you). To change an endpoint, change
its route and schema; keep `ui/src/lib/api.ts` in step with the schemas.

The "Review ready" notification and the SwiftBar menu open the studio (the
notification falls back to VS Code if the studio isn't listening).

**Live progress and cost of each run.** Runs use `claude -p --output-format
stream-json`. While a run is going, the studio shows its last steps above the
review's details ("Opening …", "Reading …", the commands it runs). When it ends,
its cost, output tokens and turns are logged and recorded in the `run` table of `marginalia.db`
(gitignored), so you can see what each pass really costs.
