// The daily budget (GLOSSARY: Budget), as GET /api/queue gives it (Budget in the contract), and how
// the studio reads it. Pure.

export interface Budget {
  since: string; resetsAt: string; limitUsd: number | null; spentUsd: number; leftUsd: number | null; over: boolean; runs: number;
  byKind: { kind: string; usd: number; runs: number }[];
  byMr: { project: string | null; iid: number | string; usd: number; runs: number }[];
}

// Past this share of the limit the meter turns amber: the day's automatic work is about to stop.
export const NEAR = 0.8;

export const money = (usd: number) => `$${usd.toFixed(2)}`;

// How full the day is, 0 to 1; null without a limit.
export const shareOf = (b: Budget) => (b.limitUsd ? Math.min(1, b.spentUsd / b.limitUsd) : null);

export const toneOf = (b: Budget): 'ok' | 'warn' | 'fail' => (b.over ? 'fail' : (shareOf(b) ?? 0) >= NEAR ? 'warn' : 'ok');

// A kind of run in words.
const KINDS: Record<string, string> = {
  review: 'Reviews', triage: 'Triages', mention: 'Mentions', chat: 'Chats', understand: 'Learning', doctor: 'Doctor', 'doctor-fix': 'Doctor fixes',
};
export const kindLabel = (kind: string) => KINDS[kind] ?? kind;
