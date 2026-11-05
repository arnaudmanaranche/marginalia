// Was the code a finding pointed at changed by a later push? Read from `git diff -U0 <then> <now> --
// <file>` (finding-events.ts: fixed_before_mr). Pure, so it is tested on plain diffs.

// The lines of the OLD file that the diff touches, as inclusive ranges. A pure insertion removes
// nothing, so it touches the line it lands next to and the one after (a guard added above a finding).
export function touchedRanges(diff: string): { start: number; end: number }[] {
  const ranges: { start: number; end: number }[] = [];
  for (const m of diff.matchAll(/^@@ -(\d+)(?:,(\d+))? \+\d+(?:,\d+)? @@/gm)) {
    const start = Number(m[1]);
    const count = m[2] === undefined ? 1 : Number(m[2]);
    ranges.push(count === 0 ? { start, end: start + 1 } : { start, end: start + count - 1 });
  }
  return ranges;
}

// A finding with a line is fixed when that line is in a touched range; one about a whole file, when
// the file changed at all. An empty diff (nothing changed there) fixes nothing.
export function fixedBy(finding: { line?: number | null }, diff: string): boolean {
  const ranges = touchedRanges(diff);
  if (!ranges.length) return false;
  return !finding.line || ranges.some((r) => finding.line! >= r.start && finding.line! <= r.end);
}
