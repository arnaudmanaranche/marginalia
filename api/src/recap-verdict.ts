// What became of one comment I posted, once the MR moved on. Pure: the caller matches the
// comment to its GitLab thread and says whether the code it flagged changed since.
//
// The label never overclaims. Only two things show a comment was heard: the flagged code changed,
// or its author resolved the thread. Bot silence is not one of them, and neither is a reply, which
// may be "will do" as well as "no".

export type Verdict = 'addressed' | 'contested' | 'untouched' | 'dropped';

export interface RecapThread {
  resolved: boolean;
  notes: { mine: boolean; bot: boolean }[];
}

export interface Signals {
  // Whether the flagged code changed since the comment; null when that cannot be told.
  linesChanged: boolean | null;
  replied: boolean;
  resolved: boolean;
}

export interface CommentVerdict {
  verdict: Verdict;
  signals: Signals;
  // The thread state and the code say different things: worth a look.
  disagreement: boolean;
}

// A reply is a note after the first from someone who is neither me nor a bot.
const repliedTo = (thread: RecapThread | null) => Boolean(thread?.notes.slice(1).some((n) => !n.mine && !n.bot));

export function commentVerdict({ dropped = false, thread, linesChanged }: { dropped?: boolean; thread: RecapThread | null; linesChanged: boolean | null }): CommentVerdict {
  const signals: Signals = { linesChanged, replied: repliedTo(thread), resolved: Boolean(thread?.resolved) };
  if (dropped) return { verdict: 'dropped', signals, disagreement: false };
  // Resolved with the code known to be untouched: said done, nothing shows it.
  if (signals.resolved && linesChanged === false) return { verdict: 'contested', signals, disagreement: true };
  if (linesChanged === true || signals.resolved) return { verdict: 'addressed', signals, disagreement: false };
  return { verdict: 'untouched', signals, disagreement: false };
}
