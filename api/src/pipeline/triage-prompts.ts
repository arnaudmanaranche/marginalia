// The staged triage of my own MR, as the agents are asked it: one agent weighs every open reviewer
// thread, then one agent per thread to fix makes that fix, which the bot commits; one more settles
// the conflicts of merging the target in, when there are some. Pure.
import { jsonAnswer, text } from './json-answer.ts';

export const TRIAGE_SYSTEM = "You are the author of this merge request, working through your reviewers' comments as one stage of Marginalia's triage. Never push, never post or resolve anything on GitLab. Write everything in English, whatever language the comments or the code use.";

const VOICE = 'Write each reply as me, the author, answering a teammate on my own MR: first person, casual and direct, like a real GitLab comment, one to three sentences. Never a third-person report about "the fix" or "this MR", never a dash used to join two clauses (write two sentences or use a comma), no filler, no inflated words, no list of three for rhythm.';

// One thread as the agents see it: where it is, who said what, and the code it is about at head.
/** @param {any} t */
export function threadText(t: any) {
  return [
    `### Thread ${t.id}${t.path ? ` on ${t.path}${t.line ? `:${t.line}` : ''}` : ' (general comment)'}`,
    ...t.notes.map((n: any) => `${n.mine ? 'me' : n.author}: ${n.body.trim()}`),
    ...(t.code ? ['Code at head:', '```', t.code, '```'] : []),
  ].join('\n');
}

export const JUDGE_VERDICTS = ['fix', 'already_fixed', 'not_relevant', 'wrong', 'answer'];

/** @param {{ context: string, threads: any[] }} input */
export function judgePrompt({ context, threads }: { context: string; threads: any[] }) {
  return [
    'Your stage: weigh each open reviewer comment on my MR. Do not change any file in this stage.',
    '', context, '',
    '## The open reviewer threads', '', ...threads.map(threadText), '',
    'For each thread, ground the verdict in the ticket, the description and the code as it is now, not in how the comment frames it:',
    '- fix: a real issue that applies; say in `plan` what to change, concretely (files, the behaviour after).',
    '- already_fixed: the MR already does what the comment asks; say where.',
    '- not_relevant: out of scope for this MR, or a misunderstanding.',
    '- wrong: factually wrong about the code; say why, with the evidence.',
    '- answer: a question to answer.',
    `For every verdict but fix, write \`reply\`. ${VOICE}`,
    '`why` is for me, not the reviewer: one or two sentences on how you decided.',
    '',
    'Answer with only this JSON, in a ```json block, one entry per thread:',
    '{"threads": [{"thread": "<thread id>", "verdict": "fix|already_fixed|not_relevant|wrong|answer", "why": "...", "plan": "for fix", "reply": "for the others"}]}',
  ].join('\n');
}

/** @param {string} answer @param {string[]} ids the threads asked about */
export function parseJudge(answer: string, ids: string[]) {
  const json = jsonAnswer(answer);
  if (!json.ok) return json;
  if (!Array.isArray(json.value.threads)) return { ok: false, error: '"threads" must be an array' };
  const out: any[] = [];
  for (const raw of json.value.threads) {
    const id = String(raw?.thread ?? '');
    if (!ids.includes(id) || out.some((o) => o.thread === id)) continue;
    if (!JUDGE_VERDICTS.includes(raw.verdict)) return { ok: false, error: `thread ${id.slice(0, 8)} has the verdict "${raw.verdict}", not one of ${JUDGE_VERDICTS.join(', ')}` };
    const entry = { thread: id, verdict: raw.verdict, why: text(raw.why, 800) ?? '', plan: text(raw.plan, 2000), reply: text(raw.reply, 3000) };
    if (entry.verdict === 'fix' && !entry.plan) return { ok: false, error: `thread ${id.slice(0, 8)} is to fix but has no "plan"` };
    if (entry.verdict !== 'fix' && !entry.reply) return { ok: false, error: `thread ${id.slice(0, 8)} has no "reply"` };
    out.push(entry);
  }
  const missing = ids.filter((id: string) => !out.some((o) => o.thread === id));
  if (missing.length) return { ok: false, error: `no verdict for thread(s) ${missing.map((m: string) => m.slice(0, 8)).join(', ')}` };
  return { ok: true, value: out };
}

/** @param {{ context: string, thread: any, plan: string }} input */
export function fixPrompt({ context, thread, plan }: { context: string; thread: any; plan: string }) {
  return [
    'Your stage: fix one reviewer comment on my MR, in this working tree.',
    '', context, '',
    '## The comment', threadText(thread), '',
    `## What to change\n${plan}`, '',
    '- Read the repo\'s rules files first and follow them. Change only what this comment needs.',
    '- Do not run git add or commit: the bot commits your change as its own commit, under `what`. Never push.',
    '- If, once you read the code, the change is not needed or not right, change nothing, and say why in the reply.',
    `- Then write \`reply\`, saying what changed, without a commit id (it is added when the fix is pushed). ${VOICE}`,
    '',
    'Answer with only this JSON, in a ```json block:',
    '{"changed": true, "what": "one sentence for me", "reply": "..."}',
  ].join('\n');
}

/** @param {string} answer */
export function parseFix(answer: string) {
  const json = jsonAnswer(answer);
  if (!json.ok) return json;
  const reply = text(json.value.reply, 3000);
  if (!reply) return { ok: false, error: 'there is no "reply"' };
  return { ok: true, value: { changed: json.value.changed === true, what: text(json.value.what, 400) ?? '', reply } };
}

// Settling the conflicts of merging the target branch into mine. The bot started the merge and
// commits it: the agent only edits the conflicted files.
/** @param {{ context: string, target: string, files: string[] }} input */
export function conflictPrompt({ context, target, files }: { context: string; target: string; files: string[] }) {
  return [
    `Your stage: settle the conflicts of merging ${target} into my MR's branch. The bot started the merge; the conflicted files hold git's conflict markers.`,
    '', context, '',
    '## The conflicted files', ...files.map((f: string) => `- ${f}`), '',
    `- For each file, read both sides (\`git diff\`, \`git log --oneline -5 MERGE_HEAD -- <file>\` for what ${target} changed and why) and write the version that keeps both intents. Follow the repo's rules files.`,
    '- Remove every conflict marker. Change nothing outside these files. Do not run git add, commit or merge: the bot does.',
    '- If a conflict cannot be settled without a decision only I can make, leave that file as it is and say so.',
    '',
    'Answer with only this JSON, in a ```json block:',
    '{"settled": true, "how": "one or two sentences for me: what each side wanted and what you kept"}',
  ].join('\n');
}

/** @param {string} answer */
export function parseConflict(answer: string) {
  const json = jsonAnswer(answer);
  if (!json.ok) return json;
  const how = text(json.value.how, 1200);
  if (!how) return { ok: false, error: 'there is no "how"' };
  return { ok: true, value: { settled: json.value.settled === true, how } };
}
