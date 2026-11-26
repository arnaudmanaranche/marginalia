// The recap of a re-reviewed MR: what became of what I said, and what is new, since the baseline.
// Pure: every read (reports, posted records, threads, the diff) is done by the caller.
import { matchFindings } from './recap-match.ts';
import { linesChanged, type ChangedFile } from './recap-changed.ts';
import { onChangedCode } from './recap-touched.ts';
import { buildComments, type BodyThread, type PostedComment, type ReportFinding } from './recap-comments.ts';
import type { Baseline } from './recap-baseline.ts';

const asFinding = (f: ReportFinding, onChanged: boolean | null) => ({ id: f.id, title: f.title, severity: f.severity, path: f.path, line: f.line, onChangedCode: onChanged });

// `previous` is the baseline report's findings, or null when there is no report to compare with (a
// submit from the current report, or from before the history): then nothing is new, gone or reworded.
// `files` is the diff from the baseline's version to now, null when that version is gone.
export function buildRecap({ slug, baseline, current, previous, posted, dismissed, threads, files, commits }: {
  slug: string; baseline: Baseline; current: ReportFinding[]; previous: ReportFinding[] | null; posted: PostedComment[]; dismissed: string[];
  threads: BodyThread[]; files: ChangedFile[] | null; commits: number;
}) {
  // No baseline at all: nothing to compare with, so no recap.
  if (baseline.at === null) return null;
  const comments = buildComments({ posted, dismissed, findings: [...(previous ?? []), ...current], threads, files });
  const match = previous ? matchFindings(previous, current) : { kept: [], added: [], gone: [], reworded: [] };
  const now = (f: ReportFinding) => asFinding(f, onChangedCode({ files, path: f.path, line: f.line }));
  const was = (f: ReportFinding) => asFinding(f, linesChanged({ files, path: f.path, line: f.line }));
  const newFindings = match.added.map(now);
  const reworded = match.reworded.map((p) => ({ was: was(p.was), now: now(p.now) }));
  // A finding already shown as one of my comments is not listed again as gone: its standing says what became of it.
  const shown = new Set(comments.map((c) => c.findingId));
  const gone = match.gone.filter((f) => !shown.has(f.id)).map(was);
  // The files I commented on: those of comments I sent, not of findings I dropped.
  const commented = new Set(comments.flatMap((c) => (c.path && c.standing !== 'dropped' ? [c.path] : [])));
  const touched = (files ?? []).filter((f) => commented.has(f.oldPath ?? f.path)).length;
  const standing = (s: string) => comments.filter((c) => c.standing === s).length;
  return {
    slug,
    baseline: { kind: baseline.kind, at: new Date(baseline.at).toISOString() },
    mr: files ? { commits, files: files.length, commentedFilesTouched: touched } : null,
    comments, newFindings, reworded, gone,
    counts: { addressed: standing('addressed'), contested: standing('contested'), untouched: standing('untouched'), dropped: standing('dropped'), newFindings: newFindings.length, reworded: reworded.length, gone: gone.length },
  };
}
