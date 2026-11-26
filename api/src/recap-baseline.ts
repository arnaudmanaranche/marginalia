// What a recap compares the MR against. Pure: the caller reads the posted comments and the
// reports of the review.
//
// The baseline is the report I last submitted from: the newest report written at or before that
// submit. With nothing submitted it is the report before the current one (the studio does not
// track what was read, so the previous report is the best stand-in).

export interface Report {
  // The report's id in the review's history; null for the current report.
  id: string | null;
  at: number;
}

export interface Baseline {
  kind: 'submitted' | 'previous';
  // When I submitted, or when the previous report was written; null when there is none.
  at: number | null;
  // The report to compare findings against; null when none that old exists. A report with no id is
  // the current one: nothing newer was written since, so there is no finding to compare.
  report: Report | null;
}

// The latest time a comment of mine reached GitLab from the review, or null.
// A record without a state is an older one, and published (see the posted comments' contract).
export function lastSubmittedAt(entries: { state?: string; at: string }[]): number | null {
  const times = entries.filter((e) => e.state !== 'draft').map((e) => Date.parse(e.at)).filter(Number.isFinite);
  return times.length ? Math.max(...times) : null;
}

// `reports` is newest first, the current report first.
export function pickBaseline({ submittedAt, reports }: { submittedAt: number | null; reports: Report[] }): Baseline {
  if (submittedAt !== null) return { kind: 'submitted', at: submittedAt, report: reports.find((r) => r.at <= submittedAt) ?? null };
  const report = reports[1] ?? null;
  return { kind: 'previous', at: report?.at ?? null, report };
}
