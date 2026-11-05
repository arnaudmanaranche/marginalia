# 0007. Home is the feed: what needs you, what runs, what happened

Status: accepted, 2026-11-05

Home was a list of MRs grouped by whose turn it is. In a factory (0006) the first screen answers two questions instead: what waits on me, and what is the bot doing. Home becomes one feed in three sections.

1. **Needs you**: everything that waits on a person, mixed in one short list: reviews that need a first look or came back after a push or an answer, a pending review to send, comments on my own MRs, the proposed comments still to decide (one line, to the approvals inbox), a job that failed and needs a person (not one retried by itself), and a project context draft to approve. The turn comes from GitLab, as before; nothing that waits on someone else is listed.
2. **Running now**: each job in progress, compact: its stage, its time; it opens on the review's plan.
3. **Activity**: the review line's measure and every job, by day, each opening into its waterfall. Own reviews are jobs and live here.

What leaves: the "Waiting on others" and "Done" groups (nobody acted on them; the command palette still reaches every review) and the separate Jobs page (Home is the feed). The reader is unchanged. PRODUCT.md's "Reading comes first" now reads: reading a review stays the core of the review line; Home is where a person sees what needs them.
