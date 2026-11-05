// The markdown report of a staged run, written from its findings file: what a person reads in the
// studio when there is no tour, and what is kept in the review history. Pure.

const SECTIONS = [['critical', 'Critical'], ['important', 'Important'], ['suggestion', 'Suggestions'], ['info', 'Notes']];
const quote = (s: string) => s.split('\n').map((l: string) => `> ${l}`).join('\n');
const place = (f: any) => (f.path ? `\`${f.path}${f.line ? `:${f.line}` : ''}\` ` : '');

/** @param {{ title: string, iid: number | string, branch: string }} mr @param {any} data the findings file of a review */
export function renderReview(mr: { title: string; iid: number | string; branch: string }, data: any) {
  const lines = [
    `# ${mr.title}`, '',
    `**MR:** !${mr.iid} | **Branch:** ${mr.branch} | **Verdict:** ${data.verdict === 'REQUEST_CHANGES' ? 'REQUEST CHANGES' : 'APPROVE'} | **Risk:** ${data.risk.level}`, '',
    '## Review Summary', '', data.summary, '',
    `**Before:** ${data.overview.before}`, '',
    `**After:** ${data.overview.after}`, '',
    `**Risk:** ${data.risk.level}, ${data.risk.rationale}`, '',
    '## The change, chapter by chapter', '',
    ...data.tour.flatMap((c: any, i: number) => [`### ${i + 1}. ${c.title}`, '', c.summary, '', `Files: ${c.files.map((f: string) => `\`${f}\``).join(', ')}`, '']),
  ];
  for (const [sev, heading] of SECTIONS) {
    const here = data.findings.filter((f: any) => f.severity === sev);
    if (!here.length) continue;
    lines.push(`## ${heading}`, '');
    for (const f of here) {
      lines.push(`- ${place(f)}**${f.title}**`, '', f.body, '');
      if (f.comment) lines.push('**Comment to post:**', '', quote(f.comment), '');
    }
  }
  return `${lines.join('\n').trim()}\n`;
}

const VERDICT_WORDS: Record<string, string> = { fixed: 'Fixed', already_fixed: 'Already fixed', not_relevant: 'Not relevant', wrong: 'Disagree', answered: 'Answered' };

// What merging the target branch in came to (conflicts.ts), when it had conflicts.
/** @param {any} c */
function conflictLines(c: any) {
  if (!c) return [];
  const files = c.files.map((f: string) => `\`${f}\``).join(', ');
  return ['## Conflicts with the target branch', '', c.commit
    ? `Merged in, settling ${files} in commit \`${c.commit.slice(0, 8)}\`, pushed with the fixes. ${c.how}`
    : `Not settled (${c.error}): ${files} still conflict, to settle yourself.`, ''];
}

/** @param {{ title: string, iid: number | string, branch: string }} mr @param {any[]} threads @param {any} data the findings file of a triage @param {any} [conflicts] */
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
