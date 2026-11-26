import { timeAgo } from './utils';
import type { Recap, RecapComment, RecapFinding, Standing } from './recapApi';

// The sentences of a recap, apart from the components so they are tested on plain data.
const plural = (n: number, word: string) => `${n} ${word}${n === 1 ? '' : 's'}`;

export const recapHeading = (baseline: Recap['baseline']) => `Since ${baseline.kind === 'submitted' ? 'you submitted' : 'the previous report'} (${timeAgo(baseline.at)})`;

// What happened to the MR itself. Null `mr` is said, not guessed around: the code cannot be compared.
export function mrSentence(mr: Recap['mr']): string {
  if (!mr) return 'What changed in the code cannot be told: the version you reviewed is no longer on GitLab.';
  if (!mr.commits && !mr.files) return 'Nothing was pushed since.';
  const changed = `${plural(mr.commits, 'commit')}, ${plural(mr.files, 'file')} changed`;
  return mr.commentedFilesTouched ? `${changed}, ${mr.commentedFilesTouched} with your comments` : changed;
}

// Nothing to list: no comment of mine, nothing new or reworded. The MR sentence alone is the news.
export const isQuiet = (r: Recap) => !r.comments.length && !r.newFindings.length && !r.reworded.length;

// What a comment's standing rests on, in words. Unknown code says nothing: it is not a signal.
export function signalWords(c: RecapComment): string[] {
  const words: string[] = [];
  // A disagreement says the code is untouched and the thread resolved in its own flag: not said twice.
  if (!c.disagreement) {
    if (c.signals.linesChanged === true) words.push('code changed');
    else if (c.signals.linesChanged === false) words.push('code untouched');
    if (c.signals.resolved) words.push('thread resolved');
  }
  if (c.signals.replied) words.push('replied');
  return words;
}

export const DISAGREEMENT = 'Resolved, but the code is untouched';

// What needs me first: contested, then untouched, then what was answered, then what I dropped.
const ATTENTION: Standing[] = ['contested', 'untouched', 'addressed', 'dropped'];
export const byAttention = (comments: RecapComment[]) => [...comments].sort((a, b) => ATTENTION.indexOf(a.standing) - ATTENTION.indexOf(b.standing));

// New findings on code the author changed come first. One whose place cannot be told (no line, or no
// diff to compare with) is not claimed to be on older code.
export function freshGroups(findings: RecapFinding[]) {
  return { changed: findings.filter((f) => f.onChangedCode !== false), older: findings.filter((f) => f.onChangedCode === false) };
}

export const whereOf = (f: { path: string | null; line: number | null }) => (f.path ? `${f.path}${f.line ? `:${f.line}` : ''}` : null);
