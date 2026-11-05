import { cn } from '../../lib/utils';

// An on/off setting that takes effect as a setting, not as a form answer: a track and a knob that
// slides. The word beside it says what it controls; this says whether it is on, to a screen reader
// too (role switch). The track is the run blue when on.
export function Switch({ checked, onChange, id, label, describedBy, disabled }: {
  checked: boolean; onChange: (on: boolean) => void; id: string; label: string; describedBy?: string; disabled?: boolean;
}) {
  return (
    <button
      type="button" role="switch" id={id} aria-checked={checked} aria-label={label} aria-describedby={describedBy} disabled={disabled}
      onClick={() => onChange(!checked)}
      className={cn('touch-target relative inline-flex h-5 w-9 shrink-0 items-center rounded-full ring-1 ring-inset transition-colors duration-200 motion-reduce:transition-none', checked ? 'bg-run ring-run' : 'bg-sunken ring-line-strong')}
    >
      <span aria-hidden className={cn('absolute left-0.5 size-4 rounded-full bg-white ring-1 ring-black/10 transition-transform duration-200 [transition-timing-function:var(--ease-out)] motion-reduce:transition-none', checked && 'translate-x-4')} />
    </button>
  );
}
