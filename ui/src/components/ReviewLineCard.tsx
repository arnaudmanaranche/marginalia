import { TriangleAlert } from 'lucide-react';
import type { LineMetrics } from '../lib/useLineMetrics';
import { minutes, percent } from '../lib/useLineMetrics';

// The review line at a glance (ADR 0006): how much ran, whether it holds, and whether people use
// what it proposes. Numbers in text ink; a failure says so with an icon and a word.
function Tile({ label, value, note }: { label: string; value: string; note?: React.ReactNode }) {
  return (
    <div className="rounded-xl border border-line bg-surface p-3">
      <p className="text-xs text-fg-muted">{label}</p>
      <p className="mt-1 text-2xl font-semibold tabular-nums">{value}</p>
      {note && <p className="mt-0.5 text-xs text-fg-muted">{note}</p>}
    </div>
  );
}

export function ReviewLineCard({ metrics }: { metrics: LineMetrics }) {
  const { jobs, findings } = metrics;
  const decided = findings.asProposed + findings.edited + findings.unknown + findings.dismissed;
  return (
    <section aria-labelledby="review-line" className="mt-6">
      <h2 id="review-line" className="text-base font-medium">Review line <span className="font-normal text-fg-muted">· last {metrics.days} days</span></h2>
      <div className="mt-3 grid grid-cols-2 gap-3 sm:grid-cols-3 lg:grid-cols-6">
        <Tile
          label="Jobs" value={String(jobs.total)}
          note={jobs.failed > 0
            ? <span className="inline-flex items-center gap-1 text-red-600 dark:text-red-400"><TriangleAlert className="size-3" aria-hidden />{jobs.failed} failed</span>
            : jobs.running > 0 ? `${jobs.running} running` : 'none failed'}
        />
        <Tile label="Comments acted on" value={percent(findings.actedOnRate)} note={`${decided} decided, ${findings.pending} waiting`} />
        <Tile label="Posted as proposed" value={String(findings.asProposed)} note={findings.unknown > 0 ? `${findings.unknown} more from reviews no longer kept` : undefined} />
        <Tile label="Edited first" value={String(findings.edited)} />
        <Tile label="Dismissed" value={String(findings.dismissed)} />
        <Tile label="Cost" value={`$${jobs.costUsd.toFixed(2)}`} note={`median run ${minutes(jobs.medianMs)}`} />
      </div>
    </section>
  );
}
