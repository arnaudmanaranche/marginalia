// The recap of a re-reviewed MR, read from where its pieces live and handed to the pure builder.
// Every read is a function of `RecapSources`, so this is tested on fakes and nothing is fetched from
// GitLab before it is known there is a baseline to compare with.
import { toDiffFile } from './mr-diff.ts';
import { isNotFound } from './gitlab-notes.ts';
import { resolveReviewedVersion } from './review-version.ts';
import { lastSubmittedAt, pickBaseline } from './recap-baseline.ts';
import { buildRecap } from './recap-build.ts';
import type { BodyThread, ReportFinding } from './recap-comments.ts';

// The part of a stored review a recap reads.
export interface ShapeOf {
  findings: ReportFinding[];
  reviewedSha?: string | null;
}

export interface RecapSources {
  // The review id, as the contract names it.
  id: string;
  // Every record of the review: comments, and replies to threads (which count as a submit, not as comments).
  posted: { findingId: string; at: string; state?: string; body: string; url: string | null; reply: boolean }[];
  dismissed: string[];
  current(): Promise<{ shape: ShapeOf; at: number } | null>;
  history(): Promise<{ id: string; at: string }[]>;
  historyShape(id: string): Promise<ShapeOf | null>;
  versions(): Promise<{ head_commit_sha: string }[]>;
  compare(from: string, to: string): Promise<{ commits?: unknown[]; diffs?: unknown[] }>;
  discussions(): Promise<BodyThread[]>;
}

// The diff from the version the baseline covered to the MR now. A report that did not record its
// version (`sha` null) is placed by its own time, which is `at`. `files` is null when that version is
// gone (or GitLab no longer has the commit): an empty list is a diff with no change.
async function sinceBaseline(src: RecapSources, versions: { head_commit_sha: string }[], { sha, at }: { sha: string | null; at: number }) {
  const reviewed = resolveReviewedVersion({ versions, sha, at });
  const head = versions[0]?.head_commit_sha;
  if (!reviewed.version || !reviewed.sha || !head) return { files: null, commits: 0 };
  if (reviewed.sha === head) return { files: [], commits: 0 };
  try {
    const range = await src.compare(reviewed.sha, head);
    return { files: (range.diffs ?? []).map(toDiffFile), commits: (range.commits ?? []).length };
  } catch (err) {
    // A commit GitLab no longer has (a force-push) is "gone"; anything else is a failure to report.
    if (isNotFound(err)) return { files: null, commits: 0 };
    throw err;
  }
}

export async function reviewRecap(src: RecapSources) {
  const current = await src.current();
  if (!current) return { recap: null };
  const reports = [{ id: null, at: current.at }, ...(await src.history()).map((h) => ({ id: h.id, at: Date.parse(h.at) }))];
  const baseline = pickBaseline({ submittedAt: lastSubmittedAt(src.posted), reports });
  if (baseline.at === null) return { recap: null };
  // The report the baseline names: an earlier one (its findings to compare with), the current one
  // (nothing newer was written) or none (the submit is older than the history).
  const earlier = baseline.report?.id ? await src.historyShape(baseline.report.id) : null;
  const covered = baseline.report && baseline.report.id === null ? current.shape : earlier;
  const [versions, threads] = await Promise.all([src.versions(), src.discussions()]);
  const { files, commits } = await sinceBaseline(src, versions, { sha: covered?.reviewedSha ?? null, at: baseline.report?.at ?? baseline.at });
  const recap = buildRecap({
    slug: src.id, baseline, current: current.shape.findings, previous: earlier?.findings ?? null,
    posted: src.posted.filter((p) => !p.reply), dismissed: src.dismissed, threads, files, commits,
  });
  return { recap };
}
