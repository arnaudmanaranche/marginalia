import { useCallback, useEffect, useState } from 'react';

export type Verdict = 'APPROVE' | 'REQUEST_CHANGES' | 'OTHER' | null;
type Kind = 'review' | 'comments' | 'retro';

export interface ReviewItem {
  slug: string;
  kind: Kind;
  title: string;
  iid: string | number | null;
  author: string | null;
  webUrl: string | null;
  branch: string | null;
  verdict: Verdict;
  critical: number;
  important: number;
  reviewedAt: string;
  tracked: boolean;
  summary: string | null;
  highlights: { severity: 'critical' | 'important'; text: string }[];
  stackId: string | null;
  crossLayer: CrossFinding[];
  stale: boolean;
  jira: { key: string; priority: string | null; rank: number | null } | null;
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

export interface BotStatus {
  pid: number;
  phase: 'idle' | 'polling' | 'reviewing' | 'error' | 'stopped';
  current: { iid: number; title: string; startedAt: string; progress?: string[] } | null;
  lastPoll: { at: string; ok: boolean; error: string | null } | null;
  nextPollAt: string | null;
  mrs?: { iid: number; status: string; reviewPath?: string | null }[];
}

export interface PostedInfo {
  at: string;
  iid: number;
  url: string;
  // 'draft': in GitLab's pending review until submitted. Absent on older records (published).
  state?: 'draft' | 'published';
  // false: GitLab refused the line anchor, so it went up as a general comment.
  inline?: boolean;
}

interface ReviewsPayload {
  status: BotStatus | null;
  items: ReviewItem[];
  stacks: Stack[];
  projectUrl: string | null;
  jiraBaseUrl: string | null;
  settings: { pollIntervalMinutes: number };
  allowPosting: boolean;
  posted: Record<string, PostedInfo>;
}

// Reloads on every SSE "changed" event (fs.watch on the server).
export function useReviews() {
  const [data, setData] = useState<ReviewsPayload | null>(null);
  const [error, setError] = useState<string | null>(null);

  const load = useCallback(async () => {
    try {
      const res = await fetch('/api/reviews');
      if (!res.ok) throw new Error(`HTTP ${res.status}`);
      setData(await res.json());
      setError(null);
    } catch (e) {
      setError(String((e as Error).message));
    }
  }, []);

  useEffect(() => {
    load();
    const es = new EventSource('/events');
    es.onmessage = () => load();
    const tick = setInterval(load, 30_000);
    return () => {
      es.close();
      clearInterval(tick);
    };
  }, [load]);

  return { data, error, reload: load };
}

export function useMarkdown(slug: string | null, refreshKey: string | undefined) {
  const [md, setMd] = useState<string | null>(null);
  useEffect(() => {
    if (!slug) return;
    let cancelled = false;
    fetch(`/api/reviews/${encodeURIComponent(slug)}`)
      .then((r) => (r.ok ? r.json() : Promise.reject(new Error(`HTTP ${r.status}`))))
      .then((j) => !cancelled && setMd(j.markdown))
      .catch(() => !cancelled && setMd(null));
    return () => {
      cancelled = true;
    };
  }, [slug, refreshKey]);
  return md;
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

export async function setPollInterval(minutes: number): Promise<void> {
  const res = await fetch('/api/settings', {
    method: 'PUT',
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify({ pollIntervalMinutes: minutes }),
  });
  if (!res.ok) throw new Error((await res.json().catch(() => ({}))).error ?? `HTTP ${res.status}`);
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

export async function submitReview(slug: string, summary?: string): Promise<{ submitted: number; summary: boolean }> {
  const res = await fetch('/api/submit-review', {
    method: 'POST',
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify({ slug, summary }),
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

export interface DiscussionNote {
  id: number;
  author: string | null;
  authorName: string | null;
  mine: boolean;
  body: string;
  at: string;
  path: string | null;
  line: number | null;
}

export interface Discussion {
  id: string;
  resolved: boolean;
  resolvable: boolean;
  path: string | null;
  line: number | null;
  notes: DiscussionNote[];
}

export async function fetchDiscussions(slug: string): Promise<Discussion[]> {
  const res = await fetch(`/api/discussions/${encodeURIComponent(slug)}`);
  const j = await res.json().catch(() => ({}));
  if (!res.ok) throw new Error(j.error ?? `HTTP ${res.status}`);
  return j.discussions;
}

// Goes up as a draft of the pending review, like every other comment.
export async function replyToDiscussion(slug: string, discussionId: string, body: string): Promise<void> {
  const res = await fetch('/api/reply', {
    method: 'POST',
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify({ slug, discussionId, body }),
  });
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

export async function fetchHistoryVersion(slug: string, id: string): Promise<string> {
  const res = await fetch(`/api/history/${encodeURIComponent(slug)}/${encodeURIComponent(id)}`);
  const j = await res.json().catch(() => ({}));
  if (!res.ok) throw new Error(j.error ?? `HTTP ${res.status}`);
  return j.markdown;
}
