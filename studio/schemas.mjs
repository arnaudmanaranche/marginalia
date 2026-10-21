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

export const ReviewShape = z.object({
  version: z.literal(1),
  source: ShapeSource,
  verdict: Verdict,
  summary: nullable(z.string()),
  risk: z.object({ level: z.enum(['low', 'medium', 'high']) }).passthrough().nullable().optional(),
  overview: z.object({ before: z.string(), after: z.string() }).nullable().optional(),
  tour: z.array(z.object({ id: z.string(), title: z.string(), summary: z.string(), files: z.array(z.string()) }).passthrough()).optional(),
  findings: z.array(Finding),
  warnings: z.array(z.string()),
  generatedAt: z.string().optional(),
}).describe('What the studio relies on, the same whatever skill or command wrote the review.').meta({ id: 'ReviewShape' });

const Highlight = z.object({ severity: z.enum(['critical', 'important']), text: z.string() }).meta({ id: 'Highlight' });
const CrossFinding = z.object({ kind: z.enum(['settled-later', 'belongs-lower', 'assumes-upper']), iid: z.number().int(), text: z.string() }).meta({ id: 'CrossFinding' });
const JiraRef = nullable(z.object({ key: z.string(), priority: nullable(z.string()), rank: nullable(z.number().int()) }));
const MyState = nullable(z.object({ computedAt: z.string() }).passthrough()).describe('Where the MR stands for you, read from GitLab.');

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
}).meta({ id: 'ReviewItem' });

const StackLayer = z.object({
  iid: z.number().int(), title: z.string(), webUrl: nullable(z.string()), slug: nullable(z.string()),
  status: z.string(), parentIid: nullable(z.number().int()), position: z.number().int(),
}).meta({ id: 'StackLayer' });
const Stack = z.object({ id: z.string(), baseBranch: z.string(), layers: z.array(StackLayer) }).meta({ id: 'Stack' });

export const BotStatus = z.object({
  pid: z.number().int(),
  phase: z.enum(['idle', 'polling', 'reviewing', 'error', 'stopped']),
  current: nullable(z.object({ project: z.string().optional(), iid: z.number().int(), title: z.string(), startedAt: z.string(), progress: z.array(z.string()).optional() })),
  lastPoll: nullable(z.object({ at: z.string(), ok: z.boolean(), error: nullable(z.string()) })),
  nextPollAt: nullable(z.string()),
  mrs: z.array(z.object({ project: z.string().optional(), iid: z.number().int(), status: z.string(), reviewPath: nullable(z.string()).optional() }).passthrough()).optional(),
}).describe('Content of `status.json`, written by the poller.').meta({ id: 'BotStatus' });

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
  allowPosting: z.boolean(),
  allowPush: z.boolean(),
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
