import { useEffect, useState } from 'react';
import { RefreshCw } from 'lucide-react';
import type { ReviewItem } from '../lib/api';
import { useJobs } from '../lib/useJobs';
import { useQueue } from '../lib/useQueue';
import { runEstimate } from '../lib/runEstimate';
import { money } from '../lib/budget';
import { Button } from './ui/Button';
import { Spinner } from './ds/Spinner';

// How long the button waits for the second click before it folds back to its icon.
const ARMED_MS = 5000;

// Re-running costs a paid run: the first click says what it will likely cost and what is left today,
// the second one runs it. Busy only while a run is going; locked for another reason (an earlier version
// on screen), it says why.
export function RerunButton({ item, locked, reviewing, onRerun }: { item: ReviewItem; locked: boolean; reviewing: boolean; onRerun: () => void }) {
  const [armed, setArmed] = useState(false);
  const { jobs } = useJobs();
  const budget = useQueue().queue?.budget ?? null;
  useEffect(() => {
    if (!armed) return;
    const t = setTimeout(() => setArmed(false), ARMED_MS);
    return () => clearTimeout(t);
  }, [armed]);
  useEffect(() => setArmed(false), [item.slug, locked]);
  const estimate = jobs ? runEstimate(jobs, item.slug, item.kind) : null;
  const left = budget?.leftUsd != null ? `${money(budget.leftUsd)} left today` : null;
  const cost = [estimate !== null ? `about ${money(estimate)}` : null, left].filter(Boolean).join(' · ');
  const verb = item.kind === 'comments' ? 'Triage again' : 'Run again';
  const what = item.kind === 'comments' ? 'Triage the reviewer comments again on the current head of the MR' : item.kind === 'own' ? 'Review your work again on its current head' : 'Run the review again on the current head of the MR';
  return (
    <Button
      variant={armed ? 'primary' : 'secondary'}
      disabled={locked}
      onClick={() => (armed ? (setArmed(false), onRerun()) : setArmed(true))}
      onBlur={() => setArmed(false)}
      aria-label={armed ? `${verb}${cost ? `, ${cost}` : ''}: click again to start` : item.kind === 'comments' ? 'Re-run triage' : 'Re-run review'}
      title={reviewing ? 'A run is in progress' : locked ? 'Go back to the latest version to run it again' : armed ? 'Click again to start the run' : `${what}: a paid run`}
      className="px-2.5"
    >
      {reviewing ? <Spinner className="size-4" /> : <RefreshCw className="size-4" />}
      {armed && <span className="motion-safe:animate-[fade-in_150ms_ease-out]">{verb}{cost && <span className="ml-1.5 font-normal opacity-80">{cost}</span>}</span>}
    </Button>
  );
}
