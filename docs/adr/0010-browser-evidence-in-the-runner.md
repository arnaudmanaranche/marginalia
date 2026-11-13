# 0010. Browser evidence, driven by agent-browser in the same runner

Status: accepted, 2026-11-13. Extends ADR 0009; it lifts nothing of it.

Decision: a finding about what a user sees or does (`proof: runtime`, critical or important) is reproduced in a
real browser inside the **same disposable runner**, and the reproduction keeps **evidence**: a screenshot, the
console and page errors, and the requests the page made. Each chapter's reviewer asks for it for its own
findings, so the evidence arrives with the chapter, not in one stage after all of them: a chapter's
reproductions start the moment its review ends, while the others are still being read. The chapters share the
budget of ADR 0009 (a few per review, two runners at a time, a finding another chapter took is not run twice).

Driver: `agent-browser` (Apache-2.0), one command per step. The agent reaches it through one narrow `browse`
tool the bot serves next to `run` and `write_file`: open a URL, click, fill, wait, then capture. No script and
no chained command. Chosen over Playwright after a benchmark under the runner's own flags (read-only root, no
capability, no network, non-root, 2 CPUs, 4 GB, 256 processes): both 10 runs out of 10, about 4 s each; the
image is 1.4 GB against 2.2 GB, and a step-per-command driver has no script for the agent to write. No trace is kept: its trace is
Chrome's trace-event JSON with no DOM or frames, it ran past the size cap on a trivial page, and starting it
disturbed the request log. The screenshot, console, page errors and request log carry the evidence. Playwright
(`trace.zip`, with DOM snapshots) stays the fallback if a viewable trace is wanted.

What does not change: the runner holds no login, token or `.env`; the network is off, and a page may reach
only `localhost` of the runner and the hosts the approved recipe names; limits are always set; a failed or
timed-out reproduction is `inconclusive`, never a failed review; a finding that is not reproduced is kept.

What is new, and its limits:
- Chromium runs with its own sandbox off (`--no-sandbox`): with every capability dropped it cannot start one.
  The container is the boundary, as ADR 0009 already says for the runner.
- Needs a Chromium in the runner image (Chrome for Testing has no Linux ARM64 build, so the image installs the
  distribution's) and a home and `/tmp` writable by the runner user. Opt-in per project (`"verify": true` plus a
  browser recipe), and a separate image, so the sample runner stays small.
- The recipe gains `browser`: the URL the project serves once started and the path that says it is ready.
  Approving the context approves it.
- Evidence is copied out of the runner by the bot into its data directory, with an extension allowlist and a
  size cap per file and per finding. The studio serves it; it is never posted to GitLab by itself.
- A page is untrusted code the MR's author wrote: `file:` and any host outside the allowlist are refused, and
  the whole browse is bounded by the runner's wall clock.

Verification of this decision: arguments of `browse` (host allowlist, no chaining), artifact path and size
guards, runner arguments unchanged, a seeded UI bug that must come back `reproduced` with a screenshot, a static
finding that must start no browser, and a page that reads `file:///etc/passwd`, fetches an outside host or loops.
