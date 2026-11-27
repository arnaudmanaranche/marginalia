// The staged triage of my own MR, as the agents are asked it: one agent weighs every open reviewer
// thread, then one agent per thread to fix makes that fix, which the bot commits; one more settles
// the conflicts of merging the target in, when there are some. Pure.
import { jsonAnswer, text } from './json-answer.ts';
import { BUILT_IN_METHODS, fillMethod } from './stage-methods.ts';

export const TRIAGE_SYSTEM = BUILT_IN_METHODS['triage-system'];

// One thread as the agents see it: where it is, who said what, and the code it is about at head.
export function threadText(t: any) {
  return [
    `### Thread ${t.id}${t.path ? ` on ${t.path}${t.line ? `:${t.line}` : ''}` : ' (general comment)'}`,
    ...t.notes.map((n: any) => `${n.mine ? 'me' : n.author}: ${n.body.trim()}`),
    ...(t.code ? ['Code at head:', '```', t.code, '```'] : []),
  ].join('\n');
}

export const JUDGE_VERDICTS = ['fix', 'already_fixed', 'not_relevant', 'wrong', 'answer'];

export function judgePrompt({ context, threads, method = BUILT_IN_METHODS['triage-judge'] }: { context: string; threads: any[]; method?: string }) {
  return [
    'Your stage: weigh each open reviewer comment on my MR. Do not change any file in this stage.',
    '', context, '',
    '## The open reviewer threads', '', ...threads.map(threadText), '',
    fillMethod(method),
    '',
    'Answer with only this JSON, in a ```json block, one entry per thread:',
    '{"threads": [{"thread": "<thread id>", "verdict": "fix|already_fixed|not_relevant|wrong|answer", "why": "...", "plan": "for fix", "reply": "for the others"}]}',
  ].join('\n');
}

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

export function fixPrompt({ context, thread, plan, method = BUILT_IN_METHODS['triage-fix'] }: { context: string; thread: any; plan: string; method?: string }) {
  return [
    'Your stage: fix one reviewer comment on my MR, in this working tree.',
    '', context, '',
    '## The comment', threadText(thread), '',
    `## What to change\n${plan}`, '',
    fillMethod(method),
    '',
    'Answer with only this JSON, in a ```json block:',
    '{"changed": true, "what": "one sentence for me", "reply": "..."}',
  ].join('\n');
}

export function parseFix(answer: string) {
  const json = jsonAnswer(answer);
  if (!json.ok) return json;
  const reply = text(json.value.reply, 3000);
  if (!reply) return { ok: false, error: 'there is no "reply"' };
  return { ok: true, value: { changed: json.value.changed === true, what: text(json.value.what, 400) ?? '', reply } };
}

// Settling the conflicts of merging the target branch into mine. The bot started the merge and
// commits it: the agent only edits the conflicted files.
export function conflictPrompt({ context, target, files, method = BUILT_IN_METHODS['triage-conflict'] }: { context: string; target: string; files: string[]; method?: string }) {
  return [
    `Your stage: settle the conflicts of merging ${target} into my MR's branch. The bot started the merge; the conflicted files hold git's conflict markers.`,
    '', context, '',
    '## The conflicted files', ...files.map((f: string) => `- ${f}`), '',
    fillMethod(method, { target }),
    '',
    'Answer with only this JSON, in a ```json block:',
    '{"settled": true, "how": "one or two sentences for me: what each side wanted and what you kept"}',
  ].join('\n');
}

export function parseConflict(answer: string) {
  const json = jsonAnswer(answer);
  if (!json.ok) return json;
  const how = text(json.value.how, 1200);
  if (!how) return { ok: false, error: 'there is no "how"' };
  return { ok: true, value: { settled: json.value.settled === true, how } };
}
