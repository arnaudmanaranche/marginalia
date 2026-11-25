import type { ReviewItem } from '../lib/api';
import { useJobs } from '../lib/useJobs';
import { useQueue } from '../lib/useQueue';
import { runEstimate } from '../lib/runEstimate';
import { RerunConfirm } from './RerunConfirm';

// Feeds RerunConfirm what a re-run will likely cost and what is left of today's budget.
export function RerunButton({ item, locked, reviewing, onRerun }: { item: ReviewItem; locked: boolean; reviewing: boolean; onRerun: () => void }) {
  const { jobs } = useJobs();
  const budget = useQueue().queue?.budget ?? null;
  const estimate = jobs ? runEstimate(jobs, item.slug, item.kind) : null;
  return (
    <RerunConfirm kind={item.kind} estimateUsd={estimate} leftUsd={budget?.leftUsd ?? null}
      locked={locked} reviewing={reviewing} resetKey={item.slug} onRerun={onRerun} />
  );
}
