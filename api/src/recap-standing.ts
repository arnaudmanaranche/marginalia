// What became of one comment I posted, once the MR moved on. Pure: the caller matches the
// comment to its GitLab thread and says whether the code it flagged changed since.
//
// The standing never overclaims. Only two things show a comment was heard: the flagged code changed,
// or its author resolved the thread. Bot silence is not one of them, and neither is a reply, which
// may be "will do" as well as "no".

export type Standing = 'addressed' | 'contested' | 'untouched' | 'dropped';

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

export interface CommentStanding {
  standing: Standing;
  signals: Signals;
  // The thread state and the code say different things: worth a look.
  disagreement: boolean;
}

// A reply is a note after the first from someone who is neither me nor a bot.
const repliedTo = (thread: RecapThread | null) => Boolean(thread?.notes.slice(1).some((n) => !n.mine && !n.bot));

export function commentStanding({ dropped = false, thread, linesChanged }: { dropped?: boolean; thread: RecapThread | null; linesChanged: boolean | null }): CommentStanding {
  const signals: Signals = { linesChanged, replied: repliedTo(thread), resolved: Boolean(thread?.resolved) };
  if (dropped) return { standing: 'dropped', signals, disagreement: false };
  // Resolved with the code known to be untouched: said done, nothing shows it.
  if (signals.resolved && linesChanged === false) return { standing: 'contested', signals, disagreement: true };
  if (linesChanged === true || signals.resolved) return { standing: 'addressed', signals, disagreement: false };
  return { standing: 'untouched', signals, disagreement: false };
}
