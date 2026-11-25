import { AnimatePresence, m } from 'motion/react';
import { transition } from '../lib/motion';
import { useScrollLock } from '../lib/useScrollLock';

function Open({ onClose, children }: { onClose: () => void; children: React.ReactNode }) {
  useScrollLock(true);
  return (
    <div className="fixed inset-0 z-50 md:hidden">
      <m.div role="presentation" className="absolute inset-0 bg-black/40" onClick={onClose} initial={{ opacity: 0 }} animate={{ opacity: 1, transition: transition.base }} exit={{ opacity: 0, transition: transition.fast }} />
      <m.div role="dialog" aria-modal="true" aria-label="Menu" className="relative h-full w-max shadow-2xl" initial={{ x: '-100%' }} animate={{ x: 0, transition: transition.base }} exit={{ x: '-100%', transition: transition.fast }}>
        {children}
      </m.div>
    </div>
  );
}

// The sidebar on a narrow screen (ADR 0012): it slides in over a scrim from the bar's menu button,
// a true modal (focus kept inside by the sidebar, Escape and the scrim close it, the page stays put).
export function NavDrawer({ open, onClose, children }: { open: boolean; onClose: () => void; children: React.ReactNode }) {
  return <AnimatePresence>{open && <Open onClose={onClose}>{children}</Open>}</AnimatePresence>;
}
