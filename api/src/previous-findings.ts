// What a re-run is told about the report it replaces: its findings, with their ids, so a finding
// still there keeps its id and the studio can say what is new, what is gone and what remains.
// Pure: the caller reads the previous `.findings.json`.

const MAX_FINDINGS = 40;
const one = (s) => String(s ?? '').replace(/\s+/g, ' ').trim();

/** @param {{ id?: string, severity?: string, title?: string, path?: string | null, line?: number | null }[]} findings */
export function previousFindingsPrompt(findings) {
  const kept = findings.filter((f) => f?.id).slice(0, MAX_FINDINGS);
  if (!kept.length) return '';
  return [
    'An earlier run of this review reported the findings below, each with its id. When one of them still applies, report it again with the same id, even if you word it differently. Give a new id to any other finding, and never reuse one of these ids for a different issue. Do not report one again just because it is listed here: check it against the code as it is now.',
    '',
    ...kept.map((f) => `- ${f.id} (${f.severity ?? 'finding'}${f.path ? `, ${f.path}${f.line ? `:${f.line}` : ''}` : ''}): ${one(f.title)}`),
  ].join('\n');
}
