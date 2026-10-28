// @ts-check
// The markdown report of a staged run, written from its findings file: what a person reads in the
// studio when there is no tour, and what is kept in the review history. Pure.

const SECTIONS = [['critical', 'Critical'], ['important', 'Important'], ['suggestion', 'Suggestions'], ['info', 'Notes']];
const quote = (s) => s.split('\n').map((l) => `> ${l}`).join('\n');
const place = (f) => (f.path ? `\`${f.path}${f.line ? `:${f.line}` : ''}\` ` : '');

/** @param {{ title: string, iid: number | string, branch: string }} mr @param {any} data the findings file of a review */
export function renderReview(mr, data) {
  const lines = [
    `# ${mr.title}`, '',
    `**MR:** !${mr.iid} | **Branch:** ${mr.branch} | **Verdict:** ${data.verdict === 'REQUEST_CHANGES' ? 'REQUEST CHANGES' : 'APPROVE'} | **Risk:** ${data.risk.level}`, '',
    '## Review Summary', '', data.summary, '',
    `**Before:** ${data.overview.before}`, '',
    `**After:** ${data.overview.after}`, '',
    `**Risk:** ${data.risk.level}, ${data.risk.rationale}`, '',
    '## The change, chapter by chapter', '',
    ...data.tour.flatMap((c, i) => [`### ${i + 1}. ${c.title}`, '', c.summary, '', `Files: ${c.files.map((f) => `\`${f}\``).join(', ')}`, '']),
  ];
  for (const [sev, heading] of SECTIONS) {
    const here = data.findings.filter((f) => f.severity === sev);
    if (!here.length) continue;
    lines.push(`## ${heading}`, '');
    for (const f of here) {
      lines.push(`- ${place(f)}**${f.title}**`, '', f.body, '');
      if (f.comment) lines.push('**Comment to post:**', '', quote(f.comment), '');
    }
  }
  return `${lines.join('\n').trim()}\n`;
}

const VERDICT_WORDS = { fixed: 'Fixed', already_fixed: 'Already fixed', not_relevant: 'Not relevant', wrong: 'Disagree', answered: 'Answered' };

/** @param {{ title: string, iid: number | string, branch: string }} mr @param {any[]} threads @param {any} data the findings file of a triage */
export function renderTriage(mr, threads, data) {
  const lines = [`# ${mr.title}`, '', `**MR:** !${mr.iid} | **Branch:** ${mr.branch}`, '', '## Replies to the reviewers', '', data.summary, ''];
  for (const r of data.replies) {
    const t = threads.find((x) => x.id === r.thread);
    lines.push(`### ${t?.path ? `\`${t.path}${t.line ? `:${t.line}` : ''}\`` : 'General comment'}: ${VERDICT_WORDS[r.verdict] ?? r.verdict}`, '');
    if (t) lines.push(quote(`${t.notes[0].author}: ${t.notes[0].body}`), '');
    if (r.why) lines.push(r.why, '');
    if (r.commit) lines.push(`Fix: commit \`${r.commit.slice(0, 8)}\``, '');
    lines.push('**Reply:**', '', quote(r.reply), '');
  }
  return `${lines.join('\n').trim()}\n`;
}
