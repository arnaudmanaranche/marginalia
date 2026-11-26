import type { RecapComment } from '../lib/recapApi';
import { byAttention, DISAGREEMENT, signalWords, whereOf } from '../lib/recapText';
import { STANDING_WORDS } from '../lib/recapWords';
import { Badge } from './ui/Badge';

// My posted comments, each with where it stands and what that rests on: what needs me comes first.
export function RecapComments({ comments }: { comments: RecapComment[] }) {
  return (
    <ul className="space-y-1.5">
      {byAttention(comments).map((c) => {
        const words = STANDING_WORDS[c.standing];
        const where = whereOf(c);
        return (
          <li key={c.findingId} className="flex min-w-0 flex-wrap items-baseline gap-x-2 gap-y-0.5">
            <Badge tone={words.tone}>{words.label}</Badge>
            <span className="min-w-0 truncate" title={c.title}>{c.title}</span>
            {where && <code className="max-w-full truncate text-fg-muted" title={where}>{where}</code>}
            <span className="text-fg-muted">{signalWords(c).join(' · ')}</span>
            {c.disagreement && <Badge tone="warning">{DISAGREEMENT}</Badge>}
            {c.url && <a href={c.url} target="_blank" rel="noreferrer" className="text-fg-muted underline hover:text-zinc-900 dark:hover:text-zinc-100">On GitLab</a>}
          </li>
        );
      })}
    </ul>
  );
}
