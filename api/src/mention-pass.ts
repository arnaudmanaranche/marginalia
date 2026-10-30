import { logger } from './logger.ts';
import { findMentions, type Mention } from './mention.ts';
import { decideMention, mergeQueued } from './mention-guardrail.ts';

// One pass of the polling intake over one project: reads the notes that came in since the last
// pass, turns the mentions into runs through the guardrails and answers in the thread the mention
// came in. Like passOver() it imports no config and starts nothing: everything outside comes in
// as `deps` (mention-deps.ts wires the real ones, tests pass fakes).
//
// The bot is single-process and does one thing at a time, so "one run per MR" holds by order: a
// second mention on an MR waits its turn in the same pass, and two review mentions on one MR
// become one review (mergeQueued). A mention is marked before it runs, so a crash never repeats it.
//
// deps: bot, dailyCap, now(), openMergeRequests(project), listRawDiscussions(project, iid),
//   memberAccessLevel(project, user), replyToDiscussion(project, iid, discussionId, body),
//   run: { review(mr), triage(mr), answer(mr, mention) -> text }, store: { seen(project),
//   mark(project, {noteId, at, outcome}), runsSince(iso), cursor(project), setCursor(project, iso) }.
const REFUSAL = {
  'not-a-member': 'Only members of this project with the Developer role or above can ask me to work on it.',
  'daily-cap': 'I reached my limit of runs for today. Ask again tomorrow.',
};
const startOfDay = (d: Date) => new Date(Date.UTC(d.getUTCFullYear(), d.getUTCMonth(), d.getUTCDate())).toISOString();

type Ctx = { deps: any; seen: Set<number>; levels: Map<string, number>; started: Date; failureTitle: (err: unknown) => string };
const context = (project, deps, failureTitle): Ctx => ({ deps, failureTitle, started: deps.now(), seen: deps.store.seen(project.key), levels: new Map() });

export async function intakePass(project, deps, failureTitle: (err: unknown) => string = () => 'something went wrong') {
  const since = deps.store.cursor(project.key);
  // The first pass only sets the starting point: what was said before the bot came is not replayed.
  if (!since) return deps.store.setCursor(project.key, deps.now().toISOString());
  const ctx = context(project, deps, failureTitle);
  for (const mr of (await deps.openMergeRequests(project)).filter((x) => x.updated_at > since)) {
    await handleMentions(project, mr, findMentions(await deps.listRawDiscussions(project, mr.iid), { bot: deps.bot, since: Date.parse(since) }), ctx);
  }
  deps.store.setCursor(project.key, ctx.started.toISOString());
}

// The webhook intake: one note GitLab announced, handled like the same note found by polling.
export async function intakeNote(project, mr, noteId: number, deps, failureTitle: (err: unknown) => string = () => 'something went wrong') {
  const found = findMentions(await deps.listRawDiscussions(project, mr.iid), { bot: deps.bot }).filter((m) => m.noteId === noteId);
  await handleMentions(project, mr, found, context(project, deps, failureTitle));
}

async function handleMentions(project, mr, all: Mention[], ctx: Ctx) {
  const { deps, seen, levels, started, failureTitle } = ctx;
  const mark = (m: Mention, outcome: string) => { seen.add(m.noteId); deps.store.mark(project.key, { noteId: m.noteId, at: deps.now().toISOString(), outcome }); };
  const mentions = all.filter((m) => !seen.has(m.noteId));
  const keep = new Set(mergeQueued(mentions));
  for (const m of mentions.filter((x) => !keep.has(x))) mark(m, 'merged');
  for (const mention of mentions.filter((x) => keep.has(x))) {
    const reply = (text: string) => deps.replyToDiscussion(project, mr.iid, mention.discussionId, text);
    try {
      if (!levels.has(mention.author)) levels.set(mention.author, await deps.memberAccessLevel(project, mention.author));
      const decision = decideMention(mention, { seenNoteIds: seen, accessLevel: levels.get(mention.author) ?? 0, runsToday: deps.store.runsSince(startOfDay(started)), dailyCap: deps.dailyCap, busy: false });
      if (decision.action === 'ignore') {
        mark(mention, decision.reason);
        if (decision.reason !== 'duplicate') await reply(REFUSAL[decision.reason]);
        continue;
      }
      mark(mention, 'ran');
      await reply(await respond({ mr, mention }, deps, failureTitle));
    } catch (err) {
      logger.error({ project: project.key, iid: mr.iid, noteId: mention.noteId, err }, 'A mention could not be handled');
    }
  }
}

// What the bot says back. A failure is told by its kind, never by the raw error.
async function respond({ mr, mention }, deps, failureTitle) {
  const { invocation } = mention;
  try {
    if (invocation.kind === 'review') {
      await deps.run.review(mr);
      return 'I reviewed this merge request. The review is in the studio.';
    }
    if (invocation.kind === 'triage') {
      if (mention.author !== mr.author?.username) return 'I only triage the comments on your own merge request: the author can ask me to.';
      await deps.run.triage(mr);
      return 'I went through the comments on this merge request. The replies are drafted in the studio.';
    }
    return await deps.run.answer(mr, mention);
  } catch (err) {
    return `I could not do that: ${failureTitle(err)}.`;
  }
}
