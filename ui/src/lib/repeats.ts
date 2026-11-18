import type { Finding } from './api';

// A chapter says the same thing three times: its summary, the finding's explanation and the comment
// to post. What a reader already has on screen is left out of the next one. Pure.
const words = (text: string) => new Set(text.toLowerCase().replace(/`/g, '').match(/[a-z0-9_]{3,}/g) ?? []);

// The share of the smaller text's words found in the other: 1 is one inside the other.
export function overlap(a: string, b: string): number {
  const [x, y] = [words(a), words(b)];
  const small = x.size <= y.size ? x : y;
  const large = small === x ? y : x;
  if (small.size === 0) return 0;
  let hit = 0;
  for (const w of small) if (large.has(w)) hit++;
  return hit / small.size;
}

export const repeats = (a: string, b: string) => overlap(a, b) >= 0.8;

// The summary without the sentences a finding of the chapter already states; null when nothing is left.
export function summaryWithoutRepeats(summary: string | null, findings: Finding[]): string | null {
  if (!summary) return null;
  const sentences = summary.match(/[^.!?\n]+(?:[.!?]+(?=\s|$)|$)/g) ?? [summary];
  const kept = sentences.filter((s) => s.trim() && !findings.some((f) => repeats(s, f.title) || repeats(s, f.body)));
  const text = kept.join('').trim();
  return text || null;
}

// The explanation of a finding unless the comment already says it (or it only restates the title).
export function bodyToShow(finding: Finding): string | null {
  if (!finding.body || finding.body === finding.title || repeats(finding.body, finding.title)) return null;
  if (finding.comment && repeats(finding.body, finding.comment)) return null;
  return finding.body;
}
