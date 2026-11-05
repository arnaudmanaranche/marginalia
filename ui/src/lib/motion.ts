// The studio's motion, defined once (DESIGN.md, Motion): short, exponential ease-out, from an
// already-visible state. Components take these presets rather than their own numbers.
export const EASE_OUT = [0.16, 1, 0.3, 1] as const;

export const transition = {
  fast: { duration: 0.15, ease: EASE_OUT },
  base: { duration: 0.22, ease: EASE_OUT },
};

// A new line arrives: it slides up 4px and fades in; a leaving one fades out in place.
export const arrive = {
  initial: { opacity: 0, y: 4 },
  animate: { opacity: 1, y: 0, transition: transition.base },
  exit: { opacity: 0, transition: transition.fast },
};

// A section opens or closes in its own height.
export const unfold = {
  initial: { opacity: 0, height: 0 },
  animate: { opacity: 1, height: 'auto', transition: transition.base },
  exit: { opacity: 0, height: 0, transition: transition.fast },
};
