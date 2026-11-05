// `current`: where a person is in a sequence they are reading (a chapter), not work going on.
export type MarkState = 'done' | 'running' | 'pending' | 'failed' | 'skipped' | 'current';

const LABEL: Record<MarkState, string> = { done: 'Done', running: 'In progress', pending: 'Not started', failed: 'Failed', skipped: 'Skipped', current: 'Here' };

// The state of a step, a job or a run, drawn the same everywhere: a filled disc with a check when
// done (the check draws itself when it lands), a turning arc while running, a dashed ring before it
// starts, a filled disc with a cross when it failed, a ring with a bar when it was skipped. Coloured
// from the run-state tokens and always named for screen readers (the word is its second code).
export function StatusMark({ state, size = 16, label }: { state: MarkState; size?: number; label?: string }) {
  const common = { width: size, height: size, viewBox: '0 0 16 16', role: 'img', 'aria-label': label ?? LABEL[state], className: 'shrink-0' } as const;
  if (state === 'done' || state === 'failed') {
    return (
      <svg {...common}>
        <circle cx="8" cy="8" r="8" fill={state === 'done' ? 'var(--ok)' : 'var(--fail)'} />
        {state === 'done' ? (
          <path className="mark-draw" d="M4.6 8.3l2.2 2.2 4.6-4.8" fill="none" stroke="var(--color-white)" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round" pathLength={1} />
        ) : (
          <path d="M5.4 5.4l5.2 5.2M10.6 5.4l-5.2 5.2" stroke="var(--color-white)" strokeWidth="1.8" strokeLinecap="round" />
        )}
      </svg>
    );
  }
  if (state === 'current') {
    return (
      <svg {...common}>
        <circle cx="8" cy="8" r="6.5" fill="none" stroke="var(--run)" strokeWidth="1.75" />
        <circle cx="8" cy="8" r="3" fill="var(--run)" />
      </svg>
    );
  }
  if (state === 'running') {
    return (
      <svg {...common}>
        <circle cx="8" cy="8" r="6.5" fill="none" stroke="var(--idle)" strokeWidth="2" opacity="0.5" />
        <g className="mark-turn">
          <circle cx="8" cy="8" r="6.5" fill="none" stroke="var(--run)" strokeWidth="2" strokeLinecap="round" strokeDasharray="12 41" />
        </g>
        <circle cx="8" cy="8" r="2" fill="var(--run)" />
      </svg>
    );
  }
  return (
    <svg {...common}>
      <circle cx="8" cy="8" r="6.5" fill="none" stroke="var(--idle)" strokeWidth="1.5" strokeDasharray={state === 'pending' ? '2.2 2.4' : undefined} />
      {state === 'skipped' && <path d="M5.5 8h5" stroke="var(--idle)" strokeWidth="1.5" strokeLinecap="round" />}
    </svg>
  );
}
