// The review line's measure (ADR 0006), from what this bot recorded: how many jobs ran and how they
// ended, what they cost, and what people did with the comments they proposed. Pure: tested on plain
// values, computed locally so it works with PostHog off.

const DAY = 24 * 60 * 60 * 1000;

interface JobIn { startedAt: string; endedAt: string | null; outcome: string; cost: { usd: number } | null }
// `posted_unknown`: added to a review whose finding can no longer be read, so neither as proposed nor edited can be shown.
interface Decided { at: string; outcome: 'posted' | 'posted_edited' | 'posted_unknown' | 'dismissed' | 'fixed_before_mr' }

const median = (xs: number[]) => {
  if (!xs.length) return null;
  const s = [...xs].sort((a, b) => a - b);
  const m = Math.floor(s.length / 2);
  return s.length % 2 ? s[m] : (s[m - 1] + s[m]) / 2;
};

/** @param {{ jobs: JobIn[], decided: Decided[], pending: number, now?: number, days?: number }} input */
export function lineMetrics({ jobs, decided, pending, now = Date.now(), days = 28 }: { jobs: JobIn[]; decided: Decided[]; pending: number; now?: number; days?: number }) {
  const since = now - days * DAY;
  const inWindow = (iso: string) => Date.parse(iso) >= since;
  const recent = jobs.filter((j) => inWindow(j.startedAt));
  const finished = recent.filter((j) => j.endedAt && j.outcome !== 'running');
  const count = (outcome: Decided['outcome']) => decided.filter((d) => inWindow(d.at) && d.outcome === outcome).length;
  const asProposed = count('posted');
  const edited = count('posted_edited');
  const dismissed = count('dismissed');
  const unknown = count('posted_unknown');
  // Own findings a push fixed: a person acting on their own review, not on a proposed comment, so
  // they stay out of the acted-on rate (which is over comments proposed to be posted).
  const fixedBefore = count('fixed_before_mr');
  const acted = asProposed + edited + unknown + dismissed;
  const durations = finished.filter((j) => j.outcome === 'reviewed').map((j) => Date.parse(j.endedAt!) - Date.parse(j.startedAt));
  return {
    days,
    jobs: {
      total: recent.length,
      failed: recent.filter((j) => j.outcome === 'failed').length,
      running: recent.filter((j) => j.outcome === 'running').length,
      medianMs: median(durations),
      costUsd: Math.round(recent.reduce((sum, j) => sum + (j.cost?.usd ?? 0), 0) * 100) / 100,
    },
    findings: {
      asProposed, edited, unknown, dismissed, pending, fixedBefore,
      // Of the comments a person decided on or still has to, the share already decided.
      actedOnRate: acted + pending ? acted / (acted + pending) : null,
    },
  };
}
