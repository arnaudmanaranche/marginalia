// The markdown report of a staged run, written from its findings file: what a person reads in the
// studio when there is no tour, and what is kept in the review history. Pure.
import { Severity } from '@worldia/marginalia-contract';

const HEADINGS: Record<string, string> = { critical: 'Critical', important: 'Important', suggestion: 'Suggestions', info: 'Notes' };
const quote = (s: string) => s.split('\n').map((l: string) => `> ${l}`).join('\n');
const axisLine = (a: any) => `- ${a.axis}: ${a.level}${a.note ? `, ${a.note}` : ''}`;
const riskLines = (risk: any) => [
  ...(risk.axes?.length ? ['', ...risk.axes.map(axisLine)] : []),
  ...(risk.mitigations?.length ? ['', 'To lower it:', ...risk.mitigations.map((m: string) => `- ${m}`)] : []),
  '',
];
const REPRODUCTION = { reproduced: 'Reproduced', not_reproduced: 'Not reproduced', inconclusive: 'Could not be reproduced here', skipped: 'Not run' } as Record<string, string>;
const proofLines = (v: any) => (v ? [`**${REPRODUCTION[v.status] ?? v.status}.**${v.evidence ? ` ${v.evidence}` : ''}${v.command ? ` Command: \`${v.command}\`.` : ''}`, ''] : []);
const place = (f: any) => (f.path ? `\`${f.path}${f.line ? `:${f.line}` : ''}\` ` : '');

export function renderReview(mr: { title: string; iid: number | string; branch: string }, data: any) {
  const lines = [
    `# ${mr.title}`, '',
    `**MR:** !${mr.iid} | **Branch:** ${mr.branch} | **Verdict:** ${data.verdict === 'REQUEST_CHANGES' ? 'REQUEST CHANGES' : 'APPROVE'} | **Risk:** ${data.risk.level}`, '',
    '## Review Summary', '', data.summary, '',
    `**Before:** ${data.overview.before}`, '',
    `**After:** ${data.overview.after}`, '',
    `**Risk:** ${data.risk.level}, ${data.risk.rationale}`, ...riskLines(data.risk),
    '## The change, chapter by chapter', '',
    ...data.tour.flatMap((c: any, i: number) => [`### ${i + 1}. ${c.title}`, '', c.summary, '', `Files: ${c.files.map((f: string) => `\`${f}\``).join(', ')}`, '']),
  ];
  for (const sev of Severity.options) {
    const here = data.findings.filter((f: any) => f.severity === sev);
    if (!here.length) continue;
    lines.push(`## ${HEADINGS[sev]}`, '');
    for (const f of here) {
      lines.push(`- ${place(f)}**${f.title}**`, '', f.body, '', ...proofLines(f.verification));
      if (f.comment) lines.push('**Comment to post:**', '', quote(f.comment), '');
    }
  }
  return `${lines.join('\n').trim()}\n`;
}

const VERDICT_WORDS: Record<string, string> = { fixed: 'Fixed', already_fixed: 'Already fixed', not_relevant: 'Not relevant', wrong: 'Disagree', answered: 'Answered' };

// What merging the target branch in came to (conflicts.ts), when it had conflicts.
function conflictLines(c: any) {
  if (!c) return [];
  const files = c.files.map((f: string) => `\`${f}\``).join(', ');
  return ['## Conflicts with the target branch', '', c.commit
    ? `Merged in, settling ${files} in commit \`${c.commit.slice(0, 8)}\`, pushed with the fixes. ${c.how}`
    : `Not settled (${c.error}): ${files} still conflict, to settle yourself.`, ''];
}

export function renderTriage(mr: { title: string; iid: number | string; branch: string }, threads: any[], data: any, conflicts: any = null) {
  const lines = [`# ${mr.title}`, '', `**MR:** !${mr.iid} | **Branch:** ${mr.branch}`, '', ...conflictLines(conflicts), '## Replies to the reviewers', '', data.summary, ''];
  for (const r of data.replies) {
    const t = threads.find((x: any) => x.id === r.thread);
    lines.push(`### ${t?.path ? `\`${t.path}${t.line ? `:${t.line}` : ''}\`` : 'General comment'}: ${VERDICT_WORDS[r.verdict] ?? r.verdict}`, '');
    if (t) lines.push(quote(`${t.notes[0].author}: ${t.notes[0].body}`), '');
    if (r.why) lines.push(r.why, '');
    if (r.commit) lines.push(`Fix: commit \`${r.commit.slice(0, 8)}\``, '');
    lines.push('**Reply:**', '', quote(r.reply), '');
  }
  return `${lines.join('\n').trim()}\n`;
}
