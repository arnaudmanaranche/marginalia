// The daily budget (GLOSSARY: Budget), on plain values: what the Claude runs recorded today cost,
// against the limit, and where the money went (by kind of job, by MR). No database, no clock:
// budget-today.ts brings both. A day is the bot's local calendar day, so it resets at midnight.
//
// Only automatic work stops at the limit (a poll's reviews and triages, the doctor it starts on a
// failure); what a person asks for always runs, and its cost counts like any other.

export interface SpendRow { at: string; project: string | null; iid?: number | string | null; kind: string; costUsd?: number }

const round = (usd: number) => Math.round(usd * 100) / 100;
const TOP_MRS = 5;

const midnight = (now: number, days = 0) => {
  const d = new Date(now);
  d.setHours(0, 0, 0, 0);
  d.setDate(d.getDate() + days);
  return d;
};

// `limitUsd`: null (or 0) when there is no limit.
export function budgetOf({ runs, limitUsd, now }: { runs: SpendRow[]; limitUsd: number | null; now: number }) {
  const since = midnight(now).toISOString();
  const today = runs.filter((r) => r.at >= since);
  const spentUsd = round(today.reduce((sum, r) => sum + (r.costUsd ?? 0), 0));
  const limit = limitUsd ? limitUsd : null;
  const group = (keyOf: (r: SpendRow) => string | null) => {
    const by = new Map<string, { usd: number; runs: number; row: SpendRow }>();
    for (const r of today) {
      const key = keyOf(r);
      if (key === null) continue;
      const was = by.get(key) ?? { usd: 0, runs: 0, row: r };
      by.set(key, { usd: was.usd + (r.costUsd ?? 0), runs: was.runs + 1, row: was.row });
    }
    return [...by.values()].sort((a, b) => b.usd - a.usd);
  };
  return {
    since,
    resetsAt: midnight(now, 1).toISOString(),
    limitUsd: limit,
    spentUsd,
    leftUsd: limit === null ? null : round(Math.max(0, limit - spentUsd)),
    over: limit !== null && spentUsd >= limit,
    runs: today.length,
    byKind: group((r) => r.kind).map((g) => ({ kind: g.row.kind, usd: round(g.usd), runs: g.runs })),
    // The MRs that cost the most today: the cost of one MR is every run on it (reviews, triages, chats).
    byMr: group((r) => (r.iid === null || r.iid === undefined ? null : `${r.project}!${r.iid}`)).slice(0, TOP_MRS)
      .map((g) => ({ project: g.row.project, iid: g.row.iid as number | string, usd: round(g.usd), runs: g.runs })),
  };
}

export type Budget = ReturnType<typeof budgetOf>;

const money = (usd: number) => `$${usd.toFixed(2)}`;

// What an MR left waiting shows, and the log says.
export const heldReason = (b: Budget) => `Daily budget reached (${money(b.spentUsd)} of ${money(b.limitUsd ?? 0)}): automatic work waits until midnight. Asking for it still works.`;
