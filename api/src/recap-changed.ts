// Whether the code a comment flagged changed between the baseline's version and the MR now. Pure:
// `files` is the diff from the one to the other, as `toDiffFile` shapes it.
//
// The comment sits on the baseline's file, so its line is in the diff's old coordinates. A change
// counts when it lies within NEAR lines of it: a guard added just above is as much an answer as
// the line rewritten. The answer is null whenever it cannot be told, never a guess.

export interface DiffLine {
  t: string;
  text?: string;
  old?: number | null;
  new?: number | null;
}

export interface ChangedFile {
  path: string;
  oldPath: string | null;
  status: string;
  omitted: boolean;
  lines: DiffLine[];
}

export const NEAR = 3;

// The old line each change sits at: a deleted line at its own number, an added line at the old line
// that follows it.
function anchors(lines: DiffLine[]): number[] {
  const at: number[] = [];
  let nextOld = 0;
  for (const l of lines) {
    if (l.t === 'hunk') {
      // An addition on a hunk's first line has no old line before it: the header says where it is.
      // With no old line in the hunk (a pure insertion) `N` is the line before it.
      const head = /^@@ -(\d+)(?:,(\d+))?/.exec(l.text ?? '');
      if (head) nextOld = Number(head[1]) + (head[2] === '0' ? 1 : 0);
      continue;
    }
    if (l.old != null) nextOld = l.old + 1;
    if (l.t === 'del' && l.old != null) at.push(l.old);
    else if (l.t === 'add') at.push(nextOld);
  }
  return at;
}

export function linesChanged({ files, path, line }: { files: ChangedFile[] | null; path: string | null; line: number | null }): boolean | null {
  // No diff to compare (the reviewed version is gone), or a comment on the whole MR or a whole file.
  if (!files || path === null || line === null) return null;
  const file = files.find((f) => (f.oldPath ?? f.path) === path);
  if (!file) return false;
  if (file.status === 'deleted') return true;
  if (file.omitted) return null;
  return anchors(file.lines).some((a) => Math.abs(a - line) <= NEAR);
}
