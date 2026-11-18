import type { Finding } from './api';

// A chapter says the same thing three times: its summary, the finding's explanation and the comment
// to post. What a reader already has on screen is left out of the next one. Pure.
const words = (text: string) => new Set(text.toLowerCase().replace(/`/g, '').match(/[a-z0-9_]{3,}/g) ?? []);

// The share of `text`'s words that `other` also has: 1 is `text` entirely inside `other`.
export function overlap(text: string, other: string): number {
  const mine = words(text);
  if (mine.size === 0) return 0;
  const theirs = words(other);
  let hit = 0;
  for (const w of mine) if (theirs.has(w)) hit++;
  return hit / mine.size;
}

// `text` adds nothing to `other`.
export const repeats = (text: string, other: string) => overlap(text, other) >= 0.8;

// The summary without the sentences a finding of the chapter already states; null when nothing is left.
// Split at the end of a sentence or a line, keeping every separator, so no word is ever lost.
export function summaryWithoutRepeats(summary: string | null, findings: Finding[]): string | null {
  if (!summary) return null;
  const parts = summary.split(/((?<=[.!?])\s+|\n+)/);
  let out = '';
  for (let i = 0; i < parts.length; i += 2) {
    const sentence = parts[i] ?? '';
    const stated = sentence.trim() !== '' && findings.some((f) => repeats(sentence, f.title) || repeats(sentence, f.body));
    if (!stated) out += sentence + (parts[i + 1] ?? '');
  }
  return out.trim() || null;
}

// The explanation of a finding unless the comment already says it (or it only restates the title).
export function bodyToShow(finding: Finding): string | null {
  if (!finding.body || finding.body === finding.title || repeats(finding.body, finding.title)) return null;
  if (finding.comment && repeats(finding.body, finding.comment)) return null;
  return finding.body;
}
