// Mechanical repairs of an agent's review before it meets the contract, for slips that lose nothing:
// the contract stays strict, the result handed to it is made to satisfy it. Pure; says what it did.
// A chapter naming a finding that is not in `findings` (typically one fixed since the last report,
// kept in the markdown's "Resolved" part) keeps its place in the tour without the dangling id.
export interface Repaired {
  data: unknown;
  repairs: string[];
}

/** @param data the parsed findings file of a review */
export function repairReview(data: any): Repaired {
  if (!data || typeof data !== 'object' || !Array.isArray(data.tour) || !Array.isArray(data.findings)) return { data, repairs: [] };
  const known = new Set(data.findings.map((f: any) => f?.id));
  const repairs: string[] = [];
  const tour = data.tour.map((chapter: any, i: number) => {
    if (!chapter || !Array.isArray(chapter.findings)) return chapter;
    const kept = chapter.findings.filter((id: unknown) => known.has(id));
    const dropped = chapter.findings.filter((id: unknown) => !known.has(id));
    if (!dropped.length) return chapter;
    repairs.push(`chapter ${i + 1} named ${dropped.map((id: unknown) => `"${String(id)}"`).join(', ')}, which is not among the findings: dropped from the chapter`);
    return { ...chapter, findings: kept };
  });
  return repairs.length ? { data: { ...data, tour }, repairs } : { data, repairs };
}
