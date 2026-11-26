// The comments I posted on a review, each with where it stands. Pure: the caller reads the posted
// records, the threads and the diff since the baseline.
import { linesChanged, type ChangedFile } from './recap-changed.ts';
import { commentStanding, type RecapThread } from './recap-standing.ts';

export interface ReportFinding {
  id: string;
  title: string;
  severity?: string | null;
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
}

// The thread my comment opened: the one whose first note is mine and says the same text.
export const threadFor = (threads: BodyThread[], body: string) => threads.find((t) => t.notes[0]?.mine && t.notes[0].body?.trim() === body.trim()) ?? null;

// Published comments, then the findings I chose not to send. A record that names no finding of the
// report (a reply to a thread) is not a comment of the review and is left out.
export function buildComments({ posted, dismissed, findings, threads, files }: {
  posted: PostedComment[]; dismissed: string[]; findings: ReportFinding[]; threads: BodyThread[]; files: ChangedFile[] | null;
}) {
  const find = (id: string) => findings.find((f) => f.id === id);
  const one = (f: ReportFinding, extra: { url: string | null; thread: BodyThread | null; dropped: boolean }) => {
    const { standing, signals, disagreement } = commentStanding({ dropped: extra.dropped, thread: extra.thread, linesChanged: linesChanged({ files, path: f.path, line: f.line }) });
    return { findingId: f.id, title: f.title, path: f.path, line: f.line, standing, signals, disagreement, url: extra.url };
  };
  const sent = posted.filter((p) => p.state !== 'draft').flatMap((p) => {
    const f = find(p.findingId);
    return f ? [one(f, { url: p.url, thread: threadFor(threads, p.body), dropped: false })] : [];
  });
  const chosen = new Set(sent.map((c) => c.findingId));
  const dropped = dismissed.filter((id) => !chosen.has(id)).flatMap((id) => {
    const f = find(id);
    return f ? [one(f, { url: null, thread: null, dropped: true })] : [];
  });
  return [...sent, ...dropped];
}
