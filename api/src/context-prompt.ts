// The approved project context, as a review is told it (ADR 0006): what the product is, its words,
// and the critical paths with where they live, compact enough to sit in the prompt of any run.
// Pure: tested on plain values. Empty without an approved context, and reviews go on as before.

const list = (items: string[] | undefined) => (items?.length ? items.join(', ') : '');

/** @param {any | null} stored an approved StoredProjectContext */
export function projectContextPrompt(stored: any) {
  if (!stored || stored.state !== 'approved') return '';
  const c = stored.context;
  const paths = [...c.criticalPaths].sort((a: any, b: any) => a.rank - b.rank).map((p: any) => [
    `${p.rank}. ${p.name}: ${p.summary}`,
    p.where?.length ? `   lives in: ${list(p.where)}` : '',
    p.fragile?.length ? `   fragile: ${list(p.fragile)}` : '',
    p.tests?.length ? `   tested by: ${list(p.tests)}` : '',
  ].filter(Boolean).join('\n'));
  const terms = c.glossary.map((t: any) => `- ${t.name}${t.codeNames?.length ? ` (code: ${list(t.codeNames)})` : ''}: ${t.summary}${t.avoid?.length ? ` Not: ${list(t.avoid)}.` : ''}`);
  return [
    `Project context, approved by ${stored.approvedBy ?? 'a person'} (learned at ${String(stored.commit).slice(0, 8)}). It is what the team knows about this repository; the code still wins where they disagree.`,
    c.summary,
    'Critical paths, most costly to break first:',
    ...paths,
    'Domain words (use them in titles and comments):',
    ...terms,
    'When the change touches a critical path (its code, what it calls, or its tests), name it in the findings JSON as "criticalPaths": ["<exact name>"], weigh it in the risk, and ask for proof that the path still works (a test, or before/after). A change that touches none has "criticalPaths": []. Do not repeat this context in the report.',
  ].join('\n');
}
