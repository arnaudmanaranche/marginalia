// The chapters' answers made into one review, by rule, not by another agent: findings deduplicated
// and given ids, the verdict from their severities, the tour from the map. A chapter that failed
// is said in the report, never dropped silently. Pure.

const slug = (s) => String(s).toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-|-$/g, '').slice(0, 40) || 'finding';
const BLOCKING = new Set(['critical', 'important']);

/**
 * @param {{ map: any, chapters: { result: { findings: any[], verified: string } | null, error?: string | null }[] }} input
 * The findings file's shape (see findings.ts), and the warnings to show.
 */
export function mergeReview({ map, chapters }) {
  const seen = new Set();
  const ids = new Set();
  const findings = [];
  const tour = map.chapters.map((chapter, i) => {
    const done = chapters[i];
    const mine = [];
    for (const f of done?.result?.findings ?? []) {
      const key = `${f.path ?? ''}|${f.line ?? ''}|${f.title.toLowerCase()}`;
      if (seen.has(key)) continue;
      seen.add(key);
      let id = f.id ?? slug(f.title);
      for (let n = 2; ids.has(id); n += 1) id = `${f.id ?? slug(f.title)}-${n}`;
      ids.add(id);
      findings.push({ ...f, id });
      mine.push(id);
    }
    const note = done?.result ? (done.result.verified ? `\n\nVerified: ${done.result.verified}` : '') : `\n\nThis chapter could not be reviewed (${done?.error ?? 'no answer'}): read it yourself.`;
    // `unreviewed`: the chapter failed, so it is a stop to read even without findings.
    return { title: chapter.title, summary: `${chapter.summary}${note}`, files: chapter.files, findings: mine, ...(!done?.result && { unreviewed: true }) };
  });
  const failed = chapters.filter((c) => !c.result).length;
  const count = (sev) => findings.filter((f) => f.severity === sev).length;
  const blocking = findings.filter((f) => BLOCKING.has(f.severity)).length;
  const tally = findings.length
    ? `${findings.length} finding${findings.length > 1 ? 's' : ''}: ${['critical', 'important', 'suggestion', 'info'].map((s) => [count(s), s]).filter(([n]) => n).map(([n, s]) => `${n} ${s}`).join(', ')}.`
    : 'No finding.';
  return {
    data: {
      verdict: blocking ? 'REQUEST_CHANGES' : 'APPROVE',
      summary: `${map.overview.after} ${tally}${failed ? ` ${failed} chapter${failed > 1 ? 's' : ''} could not be reviewed.` : ''}`,
      risk: map.risk,
      overview: map.overview,
      tour,
      findings,
    },
    warnings: [...map.warnings, ...(failed ? [`${failed} of ${chapters.length} chapters could not be reviewed`] : [])],
  };
}
