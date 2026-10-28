export type Verdict = 'APPROVE' | 'REQUEST_CHANGES' | 'OTHER' | null;
type Kind = 'review' | 'comments' | 'retro';

// Where an MR really stands for me, read from GitLab (see lib/review-state.mjs).
export interface MyState {
  requested: boolean;
  decision: 'approved' | 'changes_requested' | null;
  reviewed: boolean;
  drafts: number;
  myActivityAt: string | null;
  lastPushAt: string | null;
  authorActivityAt: string | null;
  peerActivityAt: string | null;
  unresolved: number;
  computedAt: string;
}

export interface ReviewItem {
  // `<project key>/<review file name>`: the file name alone can repeat from one project to another.
  slug: string;
  project: string;
  kind: Kind;
  title: string;
  iid: string | number | null;
  author: string | null;
  webUrl: string | null;
  branch: string | null;
  verdict: Verdict;
  myState?: MyState | null;
  risk?: RiskLevel | null;
  critical: number;
  important: number;
  reviewedAt: string;
  tracked: boolean;
  summary: string | null;
  highlights: { severity: 'critical' | 'important'; text: string }[];
  stackId: string | null;
  crossLayer: CrossFinding[];
  stale: boolean;
  // Findings with a ready-to-post comment, and how the bot read this review.
  postable: number;
  contract: { source: ShapeSource; warnings: string[] };
  jira: { key: string; priority: string | null; rank: number | null } | null;
  // Picked up by the bot, no report yet: the first review is to come (or running), or it failed.
  awaiting?: 'queued' | 'failed';
  // Why the last run failed, while the MR is marked failed.
  failure?: Failure | null;
}

export type RiskLevel = 'low' | 'medium' | 'high';

export interface Risk {
  level: RiskLevel;
  rationale: string | null;
  factors: string[];
}

// One stop of the guided read: a group of changes, what to check in it, and its findings.
// What the MR changed in plain words, before and after.
export interface Overview {
  before: string;
  after: string;
}

export interface TourStop {
  id: string;
  title: string;
  summary: string | null;
  files: string[];
  findingIds: string[];
  // The MR's threads this stop is about: on my own MR, the ones answered here.
  threadIds?: string[];
  // Tests, database or generated files only: read last.
  supporting?: boolean;
}

// A changed file of the MR with its numbered diff lines (see lib/mr-diff.mjs).
export interface DiffLine {
  t: 'hunk' | 'add' | 'del' | 'ctx';
  old?: number | null;
  new?: number | null;
  text: string;
}

export interface DiffFile {
  path: string;
  oldPath: string | null;
  status: 'added' | 'deleted' | 'renamed' | 'modified';
  additions: number;
  deletions: number;
  omitted: boolean;
  lines: DiffLine[];
}

type ShapeSource = 'json' | 'markdown' | 'none';
type Severity = 'critical' | 'important' | 'suggestion' | 'info';

// One point of a review, the same whatever skill wrote it (see lib/findings.mjs).
export interface Finding {
  id: string; // stable across re-runs; also the commentId when it is posted
  severity: Severity;
  title: string;
  path: string | null;
  line: number | null;
  body: string;
  comment: string | null;
}

interface ReviewShape {
  source: ShapeSource;
  verdict: Verdict;
  summary: string | null;
  risk?: Risk | null;
  overview?: Overview | null;
  tour?: TourStop[];
  findings: Finding[];
  // A triage of my own MR: the drafted answer to each reviewer thread.
  replies?: Reply[];
  warnings: string[];
}

// 'fixed': fixed by the triage, so the reply goes out once the fix is pushed.
export type ReplyVerdict = 'fixed' | 'already_fixed' | 'not_relevant' | 'wrong' | 'answered';

export interface Reply {
  thread: string;
  verdict: ReplyVerdict;
  reply: string;
  resolve: boolean;
  // The commit that fixed this thread (staged triage, one commit per thread).
  commit?: string;
}

export interface CrossFinding {
  kind: 'settled-later' | 'belongs-lower' | 'assumes-upper';
  iid: number; // the layer concerned
  text: string;
}

export interface StackLayer {
  iid: number;
  title: string;
  webUrl: string | null;
  slug: string | null; // review file, which may not exist yet
  status: string;
  parentIid: number | null;
  position: number;
}

export interface Stack {
  id: string;
  baseBranch: string;
  layers: StackLayer[];
}

// Why a run failed, sorted (lib/failure-kind.mjs). `transient`: passes by itself, retried soon.
export interface Failure {
  kind: string;
  transient: boolean;
  title: string;
  advice: string;
}

// One run of the bot on a review (see lib/run-trace.mjs): the stages it goes through and the steps it took.
export type StageState = 'pending' | 'running' | 'done' | 'failed' | 'skipped';
export interface LiveStage {
  id: string;
  label: string;
  state: StageState;
}
export interface RunStage extends LiveStage {
  startedAt: string | null;
  endedAt: string | null;
}
export interface RunStep {
  at: string;
  text: string;
  stage: string | null;
  // Taken by a sub-agent the run started.
  sub: boolean;
}
export interface RunSummary {
  id: string;
  slug: string;
  project: string;
  iid: number | string;
  kind: 'review' | 'triage';
  command: string;
  startedAt: string;
  endedAt: string | null;
  outcome: 'running' | 'reviewed' | 'skipped' | 'failed';
  error: string | null;
  failure: Failure | null;
  stages: RunStage[];
  stepCount: number;
  cost: { usd: number; turns: number; outputTokens: number } | null;
}
// The doctor's diagnosis of a failed run (lib/doctor-prompt.mjs).
export type DoctorWhere = 'bot' | 'agent' | 'environment' | 'gitlab' | 'claude' | 'repo';
export interface Doctor {
  state: 'running' | 'done' | 'failed';
  startedAt?: string;
  endedAt?: string;
  summary?: string;
  cause?: string;
  where?: DoctorWhere;
  confidence?: 'high' | 'medium' | 'low';
  evidence?: string[];
  retryWillWork?: boolean;
  fix?: { inBot: boolean; what: string | null; files: string[] };
  // Reused from an earlier run that failed the same way.
  sameAs?: string;
  error?: string;
}
// The fix the doctor prepared on a branch of Marginalia (lib/doctor-fix.mjs).
export interface DoctorFix {
  state: 'running' | 'ready' | 'nothing' | 'failed' | 'pushed';
  branch?: string;
  commit?: string;
  diffStat?: string;
  testsPassed?: boolean;
  note?: string;
  error?: string;
  url?: string | null;
}
export interface RunTrace extends RunSummary {
  steps: RunStep[];
  doctor: Doctor | null;
  fix: DoctorFix | null;
  fixSource: { available: boolean; why?: string };
}

async function postRun(slug: string, runId: string, tail: string): Promise<void> {
  const res = await fetch(`/api/reviews/${encodeURIComponent(slug)}/runs/${encodeURIComponent(runId)}/${tail}`, { method: 'POST', headers: { 'content-type': 'application/json' }, body: '{}' });
  if (!res.ok) throw new Error((await res.json().catch(() => ({}))).error ?? `HTTP ${res.status}`);
}
export const startDoctorFix = (slug: string, runId: string) => postRun(slug, runId, 'doctor/fix');
export const pushDoctorFix = (slug: string, runId: string) => postRun(slug, runId, 'doctor/fix/push');

export const startDoctor = (slug: string, runId: string) => postRun(slug, runId, 'doctor');

export interface BotStatus {
  pid: number;
  phase: 'idle' | 'polling' | 'reviewing' | 'error' | 'stopped';
  current: { project?: string; iid: number; title: string; startedAt: string; progress?: string[]; runId?: string; slug?: string; stages?: LiveStage[]; stepCount?: number } | null;
  lastPoll: { at: string; ok: boolean; error: string | null } | null;
  nextPollAt: string | null;
  mrs?: { project?: string; iid: number; status: string; reviewPath?: string | null }[];
}

export interface PostedInfo {
  at: string;
  iid: number;
  url: string;
  // 'draft': in GitLab's pending review until submitted. Absent on older records (published).
  state?: 'draft' | 'published';
  // false: GitLab refused the line anchor, so it went up as a general comment.
  inline?: boolean;
  // Studio only: sent to GitLab, no answer yet (see pendingPosts.ts).
  pending?: boolean;
  // A reply in a thread of my own MR, and whether submitting it resolves the thread.
  threadId?: string;
  resolve?: boolean;
  draftId?: number;
  body?: string;
}

export interface ReviewsPayload {
  status: BotStatus | null;
  items: ReviewItem[];
  stacks: Stack[];
  projectUrl: string | null;
  projects: { key: string; kind: 'back' | 'front' | null; gitlabProjectId: string; url: string | null }[];
  jiraBaseUrl: string | null;
  settings: Settings;
  settingsDefaults: Settings;
  // Posting on other people's MRs. My own are always open to replies and pushes.
  allowPosting: boolean;
  posted: Record<string, PostedInfo>;
}

export interface ReviewContent {
  markdown: string;
  shape: ReviewShape;
}

// "Read" tracking: slug -> reviewedAt seen. localStorage may be unavailable.
const KEY = 'mr-review-viewer:seen';
export function loadSeen(): Record<string, string> {
  try {
    return JSON.parse(localStorage.getItem(KEY) ?? '{}');
  } catch {
    return {};
  }
}
export function saveSeen(seen: Record<string, string>) {
  try {
    localStorage.setItem(KEY, JSON.stringify(seen));
  } catch {
    /* ignore */
  }
}

export interface Settings {
  pollIntervalMinutes: number;
  staleAfterDays: number;
  allowedTargetBranches: string[];
  excludeAuthors: string[];
  // false: the tour's diff shows only the files with findings or conversation.
  showFullDiff: boolean;
}

// Only the keys to change; null puts a key back on its .env default. The bot applies it without a restart.
export async function saveSettings(patch: { [K in keyof Settings]?: Settings[K] | null }): Promise<{ settings: Settings; defaults: Settings }> {
  const res = await fetch('/api/settings', {
    method: 'PUT',
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify(patch),
  });
  const j = await res.json().catch(() => ({}));
  if (!res.ok) throw new Error(j.error ?? `HTTP ${res.status}`);
  return j;
}


export async function postComment(slug: string, commentId: string, body: string, target?: { path: string; line?: number }): Promise<PostedInfo> {
  const res = await fetch('/api/post', {
    method: 'POST',
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify({ slug, commentId, body, ...target }),
  });
  const j = await res.json().catch(() => ({}));
  if (!res.ok) throw new Error(j.error ?? `HTTP ${res.status}`);
  return j;
}

// A reply in a reviewer thread of my own MR, as a draft until the replies are submitted.
export async function postReply(slug: string, threadId: string, body: string, resolve: boolean): Promise<PostedInfo> {
  const res = await fetch('/api/replies', {
    method: 'POST',
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify({ slug, threadId, body, resolve }),
  });
  const j = await res.json().catch(() => ({}));
  if (!res.ok) throw new Error(j.error ?? `HTTP ${res.status}`);
  return j;
}

export type ReviewAction = 'comment' | 'approve' | 'request_changes';

export async function submitReview(slug: string, summary?: string, action: ReviewAction = 'comment'): Promise<{ submitted: number; summary: boolean; action: ReviewAction }> {
  const res = await fetch('/api/submit-review', {
    method: 'POST',
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify({ slug, summary, action }),
  });
  const j = await res.json().catch(() => ({}));
  if (!res.ok) throw new Error(j.error ?? `HTTP ${res.status}`);
  return j;
}

export async function rerunReview(slug: string): Promise<void> {
  const res = await fetch('/api/rerun', {
    method: 'POST',
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify({ slug }),
  });
  if (!res.ok) throw new Error((await res.json().catch(() => ({}))).error ?? `HTTP ${res.status}`);
}

export interface DraftNote {
  id: number;
  body: string;
  path: string | null;
  line: number | null;
}

export async function fetchDrafts(slug: string): Promise<DraftNote[]> {
  const res = await fetch(`/api/drafts/${encodeURIComponent(slug)}`);
  const j = await res.json().catch(() => ({}));
  if (!res.ok) throw new Error(j.error ?? `HTTP ${res.status}`);
  return j.drafts;
}

export async function updateDraft(slug: string, id: number, body: string): Promise<void> {
  const res = await fetch(`/api/drafts/${encodeURIComponent(slug)}/${id}`, {
    method: 'PUT',
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify({ body }),
  });
  if (!res.ok) throw new Error((await res.json().catch(() => ({}))).error ?? `HTTP ${res.status}`);
}

export async function deleteDraft(slug: string, id: number): Promise<void> {
  const res = await fetch(`/api/drafts/${encodeURIComponent(slug)}/${id}`, { method: 'DELETE' });
  if (!res.ok) throw new Error((await res.json().catch(() => ({}))).error ?? `HTTP ${res.status}`);
}

export interface ReviewVersion {
  id: string;
  at: string;
}

export async function fetchHistory(slug: string): Promise<ReviewVersion[]> {
  const res = await fetch(`/api/history/${encodeURIComponent(slug)}`);
  const j = await res.json().catch(() => ({}));
  if (!res.ok) throw new Error(j.error ?? `HTTP ${res.status}`);
  return j.versions;
}

export async function fetchHistoryVersion(slug: string, id: string): Promise<ReviewContent> {
  const res = await fetch(`/api/history/${encodeURIComponent(slug)}/${encodeURIComponent(id)}`);
  const j = await res.json().catch(() => ({}));
  if (!res.ok) throw new Error(j.error ?? `HTTP ${res.status}`);
  return { markdown: j.markdown, shape: j.shape };
}

// Where a triage's local fixes stand against the MR branch on origin (lib/fixes.mjs).
export interface FixesStatus {
  ref: string;
  branch: string;
  state: 'none' | 'ready' | 'pushed' | 'outdated';
  fixesSha: string | null;
  remoteSha: string | null;
  commits: { sha: string; subject: string }[];
}

export async function fetchFixes(slug: string): Promise<FixesStatus> {
  const res = await fetch(`/api/fixes/${encodeURIComponent(slug)}`);
  const j = await res.json().catch(() => ({}));
  if (!res.ok) throw new Error(j.error ?? `HTTP ${res.status}`);
  if (!j.state) throw new Error('unexpected answer from the studio server');
  return j;
}

export async function pushFixes(slug: string): Promise<FixesStatus> {
  const res = await fetch('/api/push', {
    method: 'POST',
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify({ slug }),
  });
  const j = await res.json().catch(() => ({}));
  if (!res.ok) throw new Error(j.error ?? `HTTP ${res.status}`);
  return j;
}

// A thread of the MR's GitLab conversation that sits on a line of code.
export interface ThreadNote {
  id: number;
  author: string | null;
  authorName: string | null;
  mine: boolean;
  // Written by a group or project access token (review app links, CI): not reviewer feedback.
  bot: boolean;
  body: string;
  at: string;
}

export interface Thread {
  id: string;
  resolved: boolean;
  resolvable: boolean;
  // Null for a general comment on the MR (only with scope 'all').
  path: string | null;
  line: number | null;
  side: 'new' | 'old' | null;
  // Opened on an earlier version of the MR than its head: the line may have moved.
  outdated: boolean;
  notes: ThreadNote[];
}

export async function fetchThreads(slug: string, scope: 'lines' | 'all' = 'lines'): Promise<Thread[]> {
  const res = await fetch(`/api/reviews/${encodeURIComponent(slug)}/threads${scope === 'all' ? '?scope=all' : ''}`);
  const j = await res.json().catch(() => ({}));
  if (!res.ok) throw new Error(j.error ?? `HTTP ${res.status}`);
  return j.threads;
}

// One push of the MR (a GitLab version), oldest first: what it added, and who looked at it.
export interface Push {
  n: number;
  headSha: string;
  baseSha: string;
  at: string;
  // The commits this push added, newest first. After a rebase, the whole branch again.
  commits: { sha: string; title: string }[];
  rebased: boolean;
  youReviewed: boolean;
  // The bot's reports written on this push, newest first: an earlier version id, or null for the current one.
  reports: (string | null)[];
  head: boolean;
}

export interface Pushes {
  pushes: Push[];
  // After the push I last reviewed on GitLab, unless it is the head: where reading starts.
  defaultFrom: string | null;
}
