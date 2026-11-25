import { useEffect, useState } from 'react';
import { RefreshCw } from 'lucide-react';
import { AnimatePresence, m } from 'motion/react';
import { TextMorph } from 'torph/react';
import type { ReviewItem } from '../lib/api';
import { money } from '../lib/budget';
import { widen } from '../lib/motion';
import { cn } from '../lib/utils';
import { Button } from './ui/Button';
import { Spinner } from './ds/Spinner';

// How long the button waits for the second click before it folds back to its icon.
const ARMED_MS = 5000;
// The label opens out of the icon (motion: torph does not grow from empty text); while it is open the
// figures roll by place value when the estimate or what is left today changes (torph).
const MORPH = { duration: 350, ease: 'cubic-bezier(0.19, 1, 0.22, 1)' } as const;

type Props = {
  kind: ReviewItem['kind'];
  estimateUsd: number | null;
  leftUsd: number | null;
  locked: boolean;
  reviewing: boolean;
  // Folds the button back when it changes (another MR, another version on screen).
  resetKey?: string;
  onRerun: () => void;
};

// Re-running costs a paid run: the first click says what it will likely cost and what is left today,
// the second one runs it. Busy only while a run is going; locked for another reason (an earlier version
// on screen), it says why. No data of its own: RerunButton feeds it.
export function RerunConfirm({ kind, estimateUsd, leftUsd, locked, reviewing, resetKey, onRerun }: Props) {
  const [armed, setArmed] = useState(false);
  useEffect(() => {
    if (!armed) return;
    const t = setTimeout(() => setArmed(false), ARMED_MS);
    return () => clearTimeout(t);
  }, [armed]);
  useEffect(() => setArmed(false), [resetKey, locked]);
  const left = leftUsd != null ? `${money(leftUsd)} left today` : null;
  const cost = [estimateUsd !== null ? `about ${money(estimateUsd)}` : null, left].filter(Boolean).join(' · ');
  const verb = kind === 'comments' ? 'Triage again' : 'Run again';
  const what = kind === 'comments' ? 'Triage the reviewer comments again on the current head of the MR' : kind === 'own' ? 'Review your work again on its current head' : 'Run the review again on the current head of the MR';
  return (
    <Button
      variant={armed ? 'primary' : 'secondary'}
      disabled={locked}
      onClick={() => (armed ? (setArmed(false), onRerun()) : setArmed(true))}
      onBlur={() => setArmed(false)}
      aria-label={armed ? `${verb}${cost ? `, ${cost}` : ''}: click again to start` : kind === 'comments' ? 'Re-run triage' : 'Re-run review'}
      data-tip={reviewing ? 'A run is in progress' : locked ? 'Go back to the latest version to run it again' : armed ? 'Click again to start the run' : `${what}: a paid run`}
      className={cn('gap-0 px-2.5', armed && 'border border-transparent')}
    >
      {reviewing ? <Spinner className="size-4" /> : <RefreshCw className="size-4" />}
      <AnimatePresence initial={false}>
        {armed && (
          <m.span key="label" {...widen} aria-hidden className="flex overflow-hidden leading-4 whitespace-nowrap">
            <span className="pl-1.5">{verb}</span>
            {cost && <TextMorph {...MORPH} className="pl-1.5 font-normal tabular-nums opacity-80">{cost}</TextMorph>}
          </m.span>
        )}
      </AnimatePresence>
    </Button>
  );
}
