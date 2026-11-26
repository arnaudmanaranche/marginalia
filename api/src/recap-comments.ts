// The comments I posted on a review, each with where it stands. Pure: the caller reads the posted
// records, the threads and the diff since the baseline.
import { linesChanged, type ChangedFile } from './recap-changed.ts';
import { commentStanding, type RecapThread } from './recap-standing.ts';

export interface ReportFinding {
  id: string;
  title: string;
  severity: string;
  path: string | null;
  line: number | null;
}

export interface PostedComment {
  findingId: string;
  body: string;
  url: string | null;
  state?: string;
}

export interface BodyThread extends RecapThread {
  notes: { mine: boolean; bot: boolean; body: string }[];
  path?: string | null;
  line?: number | null;
}

// The thread my comment opened: one whose first note is mine and says the same text, not claimed by
// another comment, preferring the one at the comment's own file and line. Claims it.
export function threadFor(threads: BodyThread[], body: string, claimed: Set<BodyThread>, at?: { path: string | null; line: number | null }) {
  const same = threads.filter((t) => !claimed.has(t) && t.notes[0]?.mine && t.notes[0].body?.trim() === body.trim());
  const here = at?.path ? same.find((t) => t.path === at.path && (at.line === null || t.line === at.line)) : undefined;
  const thread = here ?? same[0] ?? null;
  if (thread) claimed.add(thread);
  return thread;
}

const firstLine = (body: string) => (body.split('\n').find((l) => l.trim()) ?? '').trim().slice(0, 120);

// Published comments, then the findings I chose not to send. A published comment whose finding is in
// neither report stays a comment, titled by its first line and with no location. The caller leaves
// out the records that are not comments of the review (replies to a thread).
export function buildComments({ posted, dismissed, findings, threads, files }: {
  posted: PostedComment[]; dismissed: string[]; findings: ReportFinding[]; threads: BodyThread[]; files: ChangedFile[] | null;
}) {
  const claimed = new Set<BodyThread>();
  const find = (id: string) => findings.find((f) => f.id === id);
  const one = (f: ReportFinding, extra: { url: string | null; thread: BodyThread | null; dropped: boolean }) => {
    // A comment I never sent says nothing about the code it would have flagged.
    const changed = extra.dropped ? null : linesChanged({ files, path: f.path, line: f.line });
    const { standing, signals, disagreement } = commentStanding({ dropped: extra.dropped, thread: extra.thread, linesChanged: changed });
    return { findingId: f.id, title: f.title, path: f.path, line: f.line, standing, signals, disagreement, url: extra.url };
  };
  const sent = posted.filter((p) => p.state !== 'draft').map((p) => {
    const f = find(p.findingId) ?? { id: p.findingId, title: firstLine(p.body) || p.findingId, severity: 'info', path: null, line: null };
    return one(f, { url: p.url, thread: threadFor(threads, p.body, claimed, f), dropped: false });
  });
  const chosen = new Set(sent.map((c) => c.findingId));
  const dropped = dismissed.filter((id) => !chosen.has(id)).flatMap((id) => {
    const f = find(id);
    return f ? [one(f, { url: null, thread: null, dropped: true })] : [];
  });
  return [...sent, ...dropped];
}
