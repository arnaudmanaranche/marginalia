import { isBotAuthor } from './gitlab-notes.ts';

// A mention of the bot in an MR comment, read into what it asks (GLOSSARY.md: Mention, Invocation).
// Pure: the intakes (polling, webhook) hand it notes and get the same records back.
export type Invocation = { kind: 'review' } | { kind: 'triage' } | { kind: 'question'; text: string } | { kind: 'followup'; text: string };

export interface Mention {
  noteId: number;
  discussionId: string;
  author: string;
  at: string;
  invocation: Invocation;
}

const escape = (s: string) => s.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
// What a person quoted or showed as code is not addressed to the bot.
const unquoted = (body: string) => body.replace(/```[\s\S]*?```/g, ' ').replace(/`[^`\n]*`/g, ' ').split('\n').filter((l) => !l.trimStart().startsWith('>')).join('\n');

/** The text of `body` once `@bot` is taken out, or null when it does not address the bot. */
export function textAfterMention(body: string, bot: string): string | null {
  const re = new RegExp(`(^|[^\\w@.-])@${escape(bot)}(?![\\w-])`, 'gi');
  const plain = unquoted(body);
  if (!re.test(plain)) return null;
  return plain.replace(re, '$1').replace(/\s+/g, ' ').replace(/ ([,;:.!?])/g, '$1').trim().replace(/^[,:;\s]+/, '');
}

export function invocationOf(text: string): Invocation {
  const word = text.replace(/[\s.!]+$/, '').toLowerCase();
  if (word === '' || word === 'review' || word === 'please review') return { kind: 'review' };
  if (word === 'triage') return { kind: 'triage' };
  return { kind: 'question', text };
}

// The mentions in raw GitLab discussions, oldest first. A note is skipped when it is a system note,
// the bot's own or another bot's, or not newer than `since` (a time, ms). A reply in a thread that
// already holds one of the bot's notes is a follow-up and needs no mention.
export function findMentions(discussions: any[], { bot, since = 0 }: { bot: string; since?: number }): Mention[] {
  const found: Mention[] = [];
  for (const d of discussions) {
    let botSpoke = false;
    for (const n of d.notes ?? []) {
      if (n.system) continue;
      const mine = n.author?.username === bot;
      if (mine) { botSpoke = true; continue; }
      if (isBotAuthor(n.author) || new Date(n.created_at).getTime() <= since) continue;
      const text = textAfterMention(n.body ?? '', bot);
      const invocation = text !== null ? invocationOf(text) : botSpoke ? { kind: 'followup' as const, text: String(n.body).trim() } : null;
      if (invocation) found.push({ noteId: n.id, discussionId: d.id, author: n.author?.username, at: n.created_at, invocation });
    }
  }
  return found.sort((a, b) => a.at.localeCompare(b.at));
}
