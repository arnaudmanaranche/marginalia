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

// The line each change sits at on one side of the diff. On the old side a deleted line sits at its
// own number and an added line at the old line that follows it; on the new side, the other way round.
export function anchors(lines: DiffLine[], side: 'old' | 'new' = 'old'): number[] {
  const own = side === 'old' ? 'del' : 'add';
  const at: number[] = [];
  let next = 0;
  for (const l of lines) {
    if (l.t === 'hunk') {
      // A change on a hunk's first line has no line before it on this side: the header says where it is.
      // With no line of this side in the hunk (a pure insertion or deletion) `N` is the line before it.
      const head = /^@@ -(\d+)(?:,(\d+))? \+(\d+)(?:,(\d+))?/.exec(l.text ?? '');
      if (head) next = side === 'old' ? Number(head[1]) + (head[2] === '0' ? 1 : 0) : Number(head[3]) + (head[4] === '0' ? 1 : 0);
      continue;
    }
    const here = l[side];
    if (here != null) next = here + 1;
    if (l.t === own && here != null) at.push(here);
    else if (l.t === 'add' || l.t === 'del') at.push(next);
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
