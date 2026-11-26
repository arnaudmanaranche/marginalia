// Whether a finding of the current report sits on code the author changed since the baseline. Pure:
// `files` is the diff from the baseline's version to the MR now, as `toDiffFile` shapes it.
//
// The mirror of `linesChanged`: a finding's line is on the new side, where a comment's was on the
// old one. False is a real answer (older code the bot only raised now); null is for when it cannot
// be told, never a guess.
import { anchors, NEAR, type ChangedFile } from './recap-changed.ts';

export function onChangedCode({ files, path, line }: { files: ChangedFile[] | null; path: string | null; line: number | null }): boolean | null {
  // No diff to compare (`null`; an empty list is a diff with no change, so false), or a finding on
  // the whole MR or a whole file.
  if (!files || path === null || line === null) return null;
  const file = files.find((f) => f.path === path);
  if (!file || file.status === 'deleted') return false;
  // A file added since the baseline is changed all through, whether or not its diff was shown.
  if (file.status === 'added') return true;
  if (file.omitted) return null;
  return anchors(file.lines, 'new').some((a) => Math.abs(a - line) <= NEAR);
}
