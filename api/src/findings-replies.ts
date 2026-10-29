import { clip, str } from './findings-text.ts';

// The replies a triage drafted for the reviewer threads of my own MR, one per thread:
//   { thread, verdict, reply, resolve }
// - thread:  the GitLab discussion id the reply goes into
// - verdict: 'fixed'          fixed by this triage (the reply is sent once the fix is pushed)
//            'already_fixed'  the MR already does what the comment asks
//            'not_relevant'   out of scope, or a misunderstanding
//            'wrong'          factually wrong about the code
//            'answered'       a question, answered
// - resolve: whether sending the reply also resolves the thread
// - commit:  for a 'fixed' reply of the staged triage, the commit that fixed this thread
export const REPLY_VERDICTS = ['fixed', 'already_fixed', 'not_relevant', 'wrong', 'answered'];

// A fix settles the thread; a disagreement is left for the reviewer to resolve.
const RESOLVED_BY_DEFAULT = new Set(['fixed', 'already_fixed']);

const DISCUSSION_ID = /^[0-9a-f]{8,64}$/i;

function normalizeVerdict(raw) {
  const v = String(raw ?? '').trim().toLowerCase().replace(/[\s-]+/g, '_');
  if (REPLY_VERDICTS.includes(v)) return v;
  if (v === 'relevant') return 'fixed';
  if (v === 'not_applicable' || v === 'out_of_scope') return 'not_relevant';
  if (v === 'incorrect' || v === 'invalid') return 'wrong';
  return null;
}

// Lenient, like the findings: keeps what it can and says what it dropped. One reply per thread.
export function normalizeReplies(raw) {
  if (raw === undefined || raw === null) return { replies: [], warnings: [] };
  if (!Array.isArray(raw)) return { replies: [], warnings: ['"replies" is not an array'] };
  const replies: Record<string, any>[] = [];
  const warnings: string[] = [];
  raw.forEach((r, i) => {
    const thread = String(r?.thread ?? r?.threadId ?? r?.discussion ?? r?.discussionId ?? '').trim();
    if (!DISCUSSION_ID.test(thread)) return void warnings.push(`reply #${i + 1} has no thread id`);
    if (replies.some((x) => x.thread === thread)) return void warnings.push(`reply #${i + 1} repeats thread ${clip(thread, 12)}`);
    const verdict = normalizeVerdict(r.verdict);
    if (!verdict) return void warnings.push(`reply #${i + 1} has an unknown verdict "${String(r.verdict ?? '').slice(0, 20)}"`);
    const reply = str(r.reply ?? r.body ?? r.text, 10_000);
    if (!reply) return void warnings.push(`reply #${i + 1} has no text`);
    const resolve = typeof r.resolve === 'boolean' ? r.resolve : RESOLVED_BY_DEFAULT.has(verdict);
    const commit = typeof r.commit === 'string' && /^[0-9a-f]{7,40}$/.test(r.commit) ? r.commit : null;
    replies.push({ thread, verdict, reply, resolve, ...(commit && { commit }) });
  });
  return { replies, warnings };
}
