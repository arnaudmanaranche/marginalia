// What the doctor is asked about a failed run, and how its answer is read. Pure: the caller hands
// it the trace, the end of the transcript and where things are, so the contract is tested here.

// Read-only: the doctor explains, it never changes anything while diagnosing.
export const DOCTOR_TOOLS = ['Read', 'Grep', 'Glob'];

export const WHERE = ['bot', 'agent', 'environment', 'gitlab', 'claude', 'repo'];

const WHERE_TEXT: Record<string, string> = {
  bot: "Marginalia's own code (poller, runner, report parsing, studio)",
  agent: 'the review or triage instructions the run followed (command, agent, skill, output contract)',
  environment: 'the machine or container (network, disk, login, config)',
  gitlab: 'GitLab (unreachable, refused, unexpected answer)',
  claude: 'Claude itself (overloaded, crashed, limits)',
  repo: 'the reviewed repository or its MR (conflicts, broken branch, huge diff)',
};

/**
 * @param {{ trace: any, transcript: string | null, sourceDir: string, agentDirs: string[] }} input
 */
export function doctorPrompt({ trace, transcript, sourceDir, agentDirs }: any) {
  const stages = trace.stages.map((s: any) => `- ${s.label}: ${s.state}${s.startedAt ? ` (${s.startedAt} → ${s.endedAt ?? '…'})` : ''}`).join('\n');
  const steps = trace.steps.slice(-80).map((s: any) => `${s.at} [${s.stage ?? '-'}]${s.sub ? ' (sub-agent)' : ''} ${s.text}`).join('\n');
  return [
    `A Marginalia run failed. Find out why, from evidence, and say where the fix belongs.`,
    '',
    `Run ${trace.id}: a ${trace.kind} of MR !${trace.iid} (${trace.project}) with the command \`${trace.command}\`.`,
    `Started ${trace.startedAt}, failed ${trace.endedAt}.`,
    '',
    'Stages:', stages,
    '',
    'Error:', '```', String(trace.error ?? '(none recorded)').slice(0, 4000), '```',
    '',
    'Last steps of the agent (newest last):', '```', steps || '(no step recorded)', '```',
    '',
    transcript ? `The raw event stream of the run (its end) is below, one JSON event per line.\n\`\`\`\n${transcript}\n\`\`\`` : 'No raw event stream was kept for this run.',
    '',
    `Marginalia's source is in ${sourceDir} (start from src/claude-runner.ts, src/report.ts, src/artifact.ts and poll.ts).`,
    agentDirs.length ? `The review and triage instructions the run followed are under: ${agentDirs.join(', ')} (commands/, agents/, skills/).` : '',
    '',
    'Read the code paths the error went through before concluding. Do not guess: when the evidence does not settle it, say so and lower your confidence.',
    '',
    'Answer with one JSON object and nothing else, in a ```json block:',
    '{',
    '  "summary": "one sentence a teammate understands without context",',
    '  "cause": "what happened, step by step, in plain words (3 to 6 sentences)",',
    `  "where": one of ${WHERE.map((w) => `"${w}"`).join(' | ')} (${WHERE.map((w) => `${w}: ${WHERE_TEXT[w]}`).join('; ')}),`,
    '  "confidence": "high" | "medium" | "low",',
    '  "evidence": ["file:line or log line that shows it", "..."],',
    '  "retryWillWork": true | false,',
    '  "fix": { "inBot": true | false, "what": "the change that keeps this from happening again, in plain words", "files": ["paths in the Marginalia source to change"] }',
    '}',
    '"fix.inBot" is true only when the fix belongs in Marginalia (its code or the instructions it ships), not when someone has to log in, reconnect or wait.',
  ].filter((l) => l !== null).join('\n');
}

const str = (v: unknown, max = 2000) => (typeof v === 'string' && v.trim() ? v.trim().slice(0, max) : null);

// The doctor's answer, checked; null when it is not one.
/** @param {string} text */
export function parseDoctorAnswer(text: unknown) {
  const block = String(text ?? '').match(/```json\s*([\s\S]*?)```/)?.[1] ?? String(text ?? '').match(/\{[\s\S]*\}/)?.[0];
  if (!block) return null;
  let raw;
  try {
    raw = JSON.parse(block);
  } catch {
    return null;
  }
  const summary = str(raw?.summary, 400);
  const cause = str(raw?.cause);
  if (!summary || !cause) return null;
  const fix = raw.fix && typeof raw.fix === 'object' ? raw.fix : {};
  return {
    summary,
    cause,
    where: WHERE.includes(raw.where) ? raw.where : 'bot',
    confidence: ['high', 'medium', 'low'].includes(raw.confidence) ? raw.confidence : 'low',
    evidence: (Array.isArray(raw.evidence) ? raw.evidence : []).map((e: unknown) => str(e, 400)).filter(Boolean).slice(0, 12),
    retryWillWork: raw.retryWillWork === true,
    fix: {
      inBot: fix.inBot === true,
      what: str(fix.what),
      files: (Array.isArray(fix.files) ? fix.files : []).map((f: unknown) => str(f, 200)).filter(Boolean).slice(0, 20),
    },
  };
}

// The doctor fixing what it found, in a worktree of Marginalia's source on a branch of its own.
// It may edit and commit there; pushing is left to the person, from the studio.
export const FIX_TOOLS = ['Read', 'Edit', 'Write', 'Grep', 'Glob', 'Bash(npm test:*)', 'Bash(node --test:*)', 'Bash(npm run check:size)', 'Bash(git status:*)', 'Bash(git diff:*)', 'Bash(git add:*)', 'Bash(git commit:*)'];

/** @param {{ trace: any, doctor: any }} input */
export function fixPrompt({ trace, doctor }: any) {
  return [
    `A Marginalia run failed, and the diagnosis says the fix belongs in Marginalia. You are in a worktree of Marginalia's source, on a branch of its own. Make the fix.`,
    '',
    `Run ${trace.id} (${trace.kind} of MR !${trace.iid}) failed with:`, '```', String(trace.error ?? '').slice(0, 3000), '```',
    '',
    `Diagnosis: ${doctor.summary}`, doctor.cause, '',
    doctor.fix?.what ? `Proposed change: ${doctor.fix.what}` : '',
    doctor.fix?.files?.length ? `Files: ${doctor.fix.files.join(', ')}` : '',
    doctor.evidence?.length ? `Evidence:\n${doctor.evidence.map((e: unknown) => `- ${e}`).join('\n')}` : '',
    '',
    'Rules:',
    '- Read CLAUDE.md first and follow it (module size, pure logic apart from I/O, comment style).',
    '- Make the smallest change that keeps this failure from happening again, for every MR, not only this one.',
    '- Add or extend a test that fails without your change and passes with it.',
    '- Run `npm test` until it passes, and `npm run check:size`.',
    '- Commit once with `git add -A && git commit -m "fix(doctor): <what it fixes>"` and a body that explains the failure and the fix. Never push.',
    '- If the diagnosis turns out wrong once you read the code, change nothing and say why.',
    '',
    'End with two or three sentences: what you changed and how you checked it.',
  ].filter((l) => l !== '').join('\n');
}
