import type { Finding, Thread } from './api';

// How far apart, in lines, a finding and a thread can be and still be about the same code.
export const NEAR_LINES = 3;

export interface RaisedBy {
  thread: Thread;
  author: string;
  body: string;
}

// The thread someone else already opened on this finding's code, or null. Anyone but me counts,
// the MR's author included; bots don't, and neither do threads I opened. A resolved thread still
// counts: the point was raised and dealt with. A finding on a line matches a thread on the new
// side within NEAR_LINES of it; a finding on the whole file matches a thread on the whole file.
export function raisedElsewhere(finding: Pick<Finding, 'path' | 'line'>, threads: Thread[]): RaisedBy | null {
  if (!finding.path) return null;
  let best: { raised: RaisedBy; distance: number } | null = null;
  for (const thread of threads) {
    const opener = thread.notes[0];
    if (!opener || opener.mine || opener.bot || thread.path !== finding.path) continue;
    let distance: number;
    if (finding.line == null) {
      if (thread.line != null) continue;
      distance = 0;
    } else {
      if (thread.line == null || thread.side === 'old') continue;
      distance = Math.abs(thread.line - finding.line);
      if (distance > NEAR_LINES) continue;
    }
    if (!best || distance < best.distance) best = { raised: { thread, author: opener.authorName ?? opener.author ?? 'someone', body: opener.body }, distance };
  }
  return best?.raised ?? null;
}
