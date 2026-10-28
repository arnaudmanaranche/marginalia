// @ts-check
import { z } from '@hono/zod-openapi';

// The contract between the studio server and the React app, as zod schemas: the routes
// validate requests with them and the OpenAPI document (/openapi.json) is generated from
// them, so the two cannot drift. Response schemas document what the server sends.
const nullable = (schema) => schema.nullable();

export const ErrorBody = z.object({ error: z.string() }).describe('Something went wrong; the message is truncated to 300 characters for GitLab errors.').meta({ id: 'ErrorBody' });
export const Ok = z.object({ ok: z.literal(true) }).meta({ id: 'Ok' });

// `<project key>/<review file name>`: the file name alone can repeat from one project to another.
export const ReviewId = z.string().regex(/^[a-z0-9][a-z0-9-]*\/[\w.-]+$/).describe('Review id: `<project key>/<review file name without .md>`. Send it URL-encoded (`back%2Ffeat-x`).').meta({ id: 'ReviewId' });

export const Verdict = nullable(z.enum(['APPROVE', 'REQUEST_CHANGES', 'OTHER']));
export const ReviewKind = z.enum(['review', 'comments']).describe('`comments` is a triage of reviewer comments on an MR you authored.').meta({ id: 'ReviewKind' });
export const ShapeSource = z.enum(['json', 'markdown', 'none']).describe('Where the findings came from: the command\'s findings file, the report\'s sections, or nowhere (then `warnings` says so).').meta({ id: 'ShapeSource' });

export const Settings = z.object({
  pollIntervalMinutes: z.number().int().min(1).max(1440),
  staleAfterDays: z.number().int().min(1).max(365).describe('MRs with no activity for this long are skipped.'),
  allowedTargetBranches: z.array(z.string()).describe('Only these target branches are reviewed; empty means all.'),
  excludeAuthors: z.array(z.string()).describe('GitLab usernames whose MRs are never touched.'),
  showFullDiff: z.boolean(),
}).meta({ id: 'Settings' });

export const Finding = z.object({
  id: z.string().regex(/^[\w-]{1,64}$/).describe('Stable across re-runs. Also the `commentId` when posted.'),
  severity: z.enum(['critical', 'important', 'suggestion', 'info']),
  title: z.string(),
  path: nullable(z.string()).describe('Repo-relative file the finding is about.'),
  line: nullable(z.number().int().min(1)).describe('Only set together with `path`.'),
  body: z.string(),
  comment: nullable(z.string()).describe('The comment to post on the merge request, ready as is.'),
}).meta({ id: 'Finding' });

export const DiscussionId = z.string().regex(/^[0-9a-f]{8,64}$/i).describe('GitLab discussion (thread) id.').meta({ id: 'DiscussionId' });

export const Reply = z.object({
  thread: DiscussionId,
  verdict: z.enum(['fixed', 'already_fixed', 'not_relevant', 'wrong', 'answered']).describe('`fixed`: fixed by this triage, sent once the fix is pushed.'),
  reply: z.string().describe('The drafted answer to the reviewer, first person.'),
  resolve: z.boolean().describe('Whether sending it also resolves the thread.'),
  commit: z.string().optional().describe('The commit that fixed this thread (staged triage): the reply names it once pushed.'),
}).meta({ id: 'Reply' });

export const ReviewShape = z.object({
  version: z.literal(1),
  source: ShapeSource,
  verdict: Verdict,
  summary: nullable(z.string()),
  risk: z.object({ level: z.enum(['low', 'medium', 'high']) }).passthrough().nullable().optional(),
  overview: z.object({ before: z.string(), after: z.string() }).nullable().optional(),
  tour: z.array(z.object({ id: z.string(), title: z.string(), summary: z.string(), files: z.array(z.string()) }).passthrough()).optional(),
  findings: z.array(Finding),
  replies: z.array(Reply).optional().describe('A triage of my own MR: the drafted reply to each reviewer thread.'),
  warnings: z.array(z.string()),
  generatedAt: z.string().optional(),
}).describe('What the studio relies on, the same whatever skill or command wrote the review.').meta({ id: 'ReviewShape' });

const Highlight = z.object({ severity: z.enum(['critical', 'important']), text: z.string() }).meta({ id: 'Highlight' });
const CrossFinding = z.object({ kind: z.enum(['settled-later', 'belongs-lower', 'assumes-upper']), iid: z.number().int(), text: z.string() }).meta({ id: 'CrossFinding' });
const JiraRef = nullable(z.object({ key: z.string(), priority: nullable(z.string()), rank: nullable(z.number().int()) }));
const MyState = nullable(z.object({ computedAt: z.string() }).passthrough()).describe('Where the MR stands for you, read from GitLab.');

export const Failure = z.object({ kind: z.string(), transient: z.boolean().describe('Passes by itself: retried soon, no alarm.'), title: z.string(), advice: z.string() }).describe('Why a run failed, sorted (lib/failure-kind.mjs).').meta({ id: 'Failure' });

export const ReviewItem = z.object({
  slug: ReviewId,
  project: z.string(),
  kind: ReviewKind,
  title: z.string(),
  iid: z.union([z.string(), z.number().int(), z.null()]).describe('Merge request number.'),
  author: nullable(z.string()),
  webUrl: nullable(z.string()),
  branch: nullable(z.string()),
  verdict: Verdict,
  risk: nullable(z.enum(['low', 'medium', 'high'])),
  critical: z.number().int().min(0),
  important: z.number().int().min(0),
  summary: nullable(z.string()),
  highlights: z.array(Highlight),
  postable: z.number().int().min(0).describe('Findings that come with a comment ready to post.'),
  contract: z.object({ source: ShapeSource, warnings: z.array(z.string()) }),
  stackId: nullable(z.string()),
  crossLayer: z.array(CrossFinding),
  stale: z.boolean().describe('Reviewed before, but the commit (or the layer below) moved since.'),
  mtime: z.string(),
  reviewedAt: z.string(),
  tracked: z.boolean().describe('A merge request in `status.json` points at this review. Posting needs it.'),
  jira: JiraRef,
  myState: MyState.optional(),
  failure: nullable(Failure).optional().describe('Why the last run failed, while the MR is marked failed.'),
  awaiting: z.enum(['queued', 'failed']).optional().describe('The bot picked the MR up and has no report for it yet: its first review is to come (or running), or it failed.'),
}).meta({ id: 'ReviewItem' });

const StackLayer = z.object({
  iid: z.number().int(), title: z.string(), webUrl: nullable(z.string()), slug: nullable(z.string()),
  status: z.string(), parentIid: nullable(z.number().int()), position: z.number().int(),
}).meta({ id: 'StackLayer' });
const Stack = z.object({ id: z.string(), baseBranch: z.string(), layers: z.array(StackLayer) }).meta({ id: 'Stack' });

const StageState = z.enum(['pending', 'running', 'done', 'failed', 'skipped']);
const LiveStage = z.object({ id: z.string(), label: z.string(), state: StageState });
export const RunStage = LiveStage.extend({ startedAt: nullable(z.string()), endedAt: nullable(z.string()) }).meta({ id: 'RunStage' });
export const RunStep = z.object({ at: z.string(), text: z.string(), stage: nullable(z.string()), sub: z.boolean().describe('Taken by a sub-agent the run started.') }).meta({ id: 'RunStep' });
const RunFields = {
  id: z.string(), slug: ReviewId, project: z.string(), iid: z.union([z.number().int(), z.string()]),
  kind: z.enum(['review', 'triage']), command: z.string(),
  startedAt: z.string(), endedAt: nullable(z.string()),
  outcome: z.enum(['running', 'reviewed', 'skipped', 'failed']),
  error: nullable(z.string()),
  failure: nullable(Failure),
  stages: z.array(RunStage),
  stepCount: z.number().int(),
  cost: nullable(z.object({ usd: z.number(), turns: z.number(), outputTokens: z.number() })),
};
export const RunSummary = z.object(RunFields).describe('One run of the bot on a review, without its steps.').meta({ id: 'RunSummary' });
export const Runs = z.object({ runs: z.array(RunSummary) }).meta({ id: 'Runs' });
export const Doctor = z.object({
  state: z.enum(['running', 'done', 'failed']),
  startedAt: z.string().optional(), endedAt: z.string().optional(),
  summary: z.string().optional(), cause: z.string().optional(),
  where: z.enum(['bot', 'agent', 'environment', 'gitlab', 'claude', 'repo']).optional(),
  confidence: z.enum(['high', 'medium', 'low']).optional(),
  evidence: z.array(z.string()).optional(), retryWillWork: z.boolean().optional(),
  fix: z.object({ inBot: z.boolean(), what: nullable(z.string()), files: z.array(z.string()) }).optional(),
  sameAs: z.string().optional().describe('Reused from an earlier run that failed the same way.'),
  error: z.string().optional(),
}).passthrough().describe("The doctor's diagnosis of a failed run.").meta({ id: 'Doctor' });
export const DoctorFix = z.object({
  state: z.enum(['running', 'ready', 'nothing', 'failed', 'pushed']),
  branch: z.string().optional(), commit: z.string().optional(), diffStat: z.string().optional(),
  testsPassed: z.boolean().optional(), note: z.string().optional(), error: z.string().optional(),
  url: nullable(z.string()).optional().describe('Where the remote offers to open a merge request for the branch.'),
}).passthrough().describe('The fix the doctor prepared on a branch of Marginalia.').meta({ id: 'DoctorFix' });
export const RunTrace = z.object({
  ...RunFields, steps: z.array(RunStep), doctor: nullable(Doctor), fix: nullable(DoctorFix),
  fixSource: z.object({ available: z.boolean(), why: z.string().optional() }).describe('Whether the doctor can prepare fixes on this install.'),
}).describe('One run with every step it took.').meta({ id: 'RunTrace' });

export const BotStatus = z.object({
  pid: z.number().int(),
  phase: z.enum(['idle', 'polling', 'reviewing', 'error', 'stopped']),
  current: nullable(z.object({ project: z.string().optional(), iid: z.number().int(), title: z.string(), startedAt: z.string(), progress: z.array(z.string()).optional(), runId: z.string().optional(), slug: ReviewId.optional(), stages: z.array(LiveStage).optional(), stepCount: z.number().int().optional() })),
  lastPoll: nullable(z.object({ at: z.string(), ok: z.boolean(), error: nullable(z.string()) })),
  nextPollAt: nullable(z.string()),
  mrs: z.array(z.object({ project: z.string().optional(), iid: z.number().int(), status: z.string(), reviewPath: nullable(z.string()).optional() }).passthrough()).optional(),
}).describe('Content of `status.json`, written by the poller.').meta({ id: 'BotStatus' });

export const BotState = z.object({ status: nullable(BotStatus), alive: z.boolean() }).meta({ id: 'BotState' });

export const PostedInfo = z.object({
  at: z.string(),
  iid: z.number().int(),
  url: z.string().describe('The note once published; the merge request until then.'),
  state: z.enum(['draft', 'published']).optional().describe('`draft`: in the pending review. Absent on older records, which are published.'),
  inline: z.boolean().optional().describe('`false` when GitLab refused the line anchor and the comment went up as a general note.'),
}).passthrough().meta({ id: 'PostedInfo' });

export const ReviewsPayload = z.object({
  status: nullable(BotStatus),
  items: z.array(ReviewItem),
  stacks: z.array(Stack),
  projectUrl: nullable(z.string()),
  projects: z.array(z.object({ key: z.string(), kind: nullable(z.enum(['back', 'front'])), gitlabProjectId: z.string(), url: nullable(z.string()) })),
  jiraBaseUrl: nullable(z.string()),
  settings: Settings,
  settingsDefaults: Settings,
  allowPosting: z.boolean().describe('Posting on other people\'s merge requests. Your own are always open to replies and pushes.'),
  posted: z.record(z.string(), PostedInfo).describe('Keyed by `<project>/<review slug>:<commentId>`.'),
}).meta({ id: 'ReviewsPayload' });

export const ReviewContent = z.object({ slug: ReviewId, kind: ReviewKind, markdown: z.string(), shape: ReviewShape }).meta({ id: 'ReviewContent' });
export const Versions = z.object({ versions: z.array(z.object({ id: z.string(), at: z.string() })) }).meta({ id: 'Versions' });
export const Version = z.object({ slug: ReviewId, id: z.string(), markdown: z.string(), shape: ReviewShape }).meta({ id: 'Version' });

const Note = z.object({ id: z.number().int(), author: nullable(z.string()), authorName: nullable(z.string()), mine: z.boolean(), bot: z.boolean().optional(), body: z.string(), at: z.string(), path: nullable(z.string()), line: nullable(z.number().int()) }).meta({ id: 'DiscussionNote' });
export const Thread = z.object({
  id: z.string(), resolved: z.boolean(), resolvable: z.boolean(), path: nullable(z.string()), line: nullable(z.number().int()),
  side: nullable(z.enum(['new', 'old'])), headSha: nullable(z.string()), outdated: z.boolean(), notes: z.array(Note),
}).meta({ id: 'Thread' });
export const Threads = z.object({ threads: z.array(Thread) }).meta({ id: 'Threads' });

export const DiffFile = z.object({
  path: z.string(), oldPath: nullable(z.string()), status: z.enum(['added', 'deleted', 'renamed', 'modified']),
  additions: z.number().int(), deletions: z.number().int(), omitted: z.boolean(), lines: z.array(z.record(z.string(), z.unknown())),
}).meta({ id: 'DiffFile' });
export const Diff = z.object({ files: z.array(DiffFile), reviewedSha: nullable(z.string()).optional(), approximate: z.boolean().optional() }).meta({ id: 'Diff' });

export const Pushes = z.object({
  pushes: z.array(z.object({
    n: z.number().int(), headSha: z.string(), baseSha: z.string(), at: z.string(),
    commits: z.array(z.object({ sha: z.string(), title: z.string() })).describe('The commits this push added, newest first.'),
    rebased: z.boolean().describe('The base moved: the push is a rebase, its commits are the whole branch again.'),
    youReviewed: z.boolean().describe('Your last review on GitLab was of this push.'),
    reports: z.array(nullable(z.string())).describe('The bot\'s reports written on this push, newest first: an earlier version id (`/api/history/{slug}/{id}`), or null for the current report.'),
    head: z.boolean(),
  })),
  defaultFrom: nullable(z.string()).describe('The head of the push you last reviewed, unless it is the MR\'s head: where to start reading.'),
}).meta({ id: 'Pushes' });

export const DraftNote = z.object({ id: z.number().int(), body: z.string(), path: nullable(z.string()), line: nullable(z.number().int()) }).meta({ id: 'DraftNote' });
export const Drafts = z.object({ drafts: z.array(DraftNote) }).meta({ id: 'Drafts' });

export const FixesStatus = z.object({
  ref: z.string(), branch: z.string(), state: z.enum(['none', 'ready', 'pushed', 'outdated']),
  fixesSha: nullable(z.string()), remoteSha: nullable(z.string()),
  commits: z.array(z.object({ sha: z.string(), subject: z.string() })).describe('The commits a push adds, newest first (only when `ready`).'),
}).meta({ id: 'FixesStatus' });

export const AddToReviewRequest = z.object({
  slug: ReviewId,
  commentId: z.string().regex(/^[\w-]{1,64}$/).describe('Stable id of the "Comment to post" block within the review.'),
  body: z.string().trim().min(1).max(10_000),
  path: z.string().min(1).max(500).refine((p) => !p.includes('\0'), 'bad path').optional().describe('File of the diff. With `line` for an inline comment, alone for a whole-file comment.'),
  line: z.number().int().min(1).optional().describe('Line of the new version of the file. Requires `path`.'),
}).refine((b) => b.line === undefined || b.path !== undefined, { message: 'line needs a path', path: ['line'] }).meta({ id: 'AddToReviewRequest' });

export const SubmitRequest = z.object({
  slug: ReviewId,
  summary: z.string().max(10_000).optional(),
  action: z.enum(['comment', 'approve', 'request_changes']).default('comment'),
}).meta({ id: 'SubmitRequest' });
export const Submitted = z.object({ submitted: z.number().int(), summary: z.boolean(), action: z.enum(['comment', 'approve', 'request_changes']) }).meta({ id: 'Submitted' });

export const ReplyRequest = z.object({
  slug: ReviewId,
  threadId: DiscussionId,
  body: z.string().trim().min(1).max(10_000),
  resolve: z.boolean().default(false).describe('Resolve the thread when the replies are submitted.'),
}).meta({ id: 'ReplyRequest' });

export const DraftEdit = z.object({ body: z.string().trim().min(1).max(10_000) }).meta({ id: 'DraftEdit' });
export const SlugBody = z.object({ slug: ReviewId }).meta({ id: 'SlugBody' });
export const ChatRequest = z.object({
  slug: ReviewId, stopId: z.string(), question: z.string(),
  history: z.array(z.unknown()).optional().describe('Earlier turns, `{ role: user|assistant, text }`; malformed ones are dropped, the last 6 kept.'),
}).meta({ id: 'ChatRequest' });
export const ChatAnswer = z.object({ answer: z.string() }).meta({ id: 'ChatAnswer' });
export const Rerun = z.object({ ok: z.literal(true), iid: z.number().int(), kind: z.enum(['review', 'comments']) }).meta({ id: 'Rerun' });
export const SettingsPatch = z.record(z.string(), z.unknown()).describe('Only the keys to change; `null` puts a key back on its default.').meta({ id: 'SettingsPatch' });
export const SettingsAnswer = z.object({ settings: Settings, defaults: Settings }).meta({ id: 'SettingsAnswer' });
