import { useState } from 'react';
import type { Section } from './reviewSections';

const OPEN_BY_DEFAULT = /critical|important|verdict|summary|blocking|bloquant|statut|status|at a glance|shape of the change/i;

// Which sections are open: what the person toggled, else a default by title.
export function useSectionState(sections: Section[]) {
  const [overrides, setOverrides] = useState<Record<string, boolean>>({});
  // Once "At a Glance" carries the gist, the summary's Overview is a repeat: fold it.
  const hasGlance = sections.some((s) => /at a glance/i.test(s.title));
  const isOpen = (s: Section) => overrides[s.id] ?? (hasGlance && /summary/i.test(s.title) ? false : OPEN_BY_DEFAULT.test(s.title));
  const allOpen = sections.every(isOpen);
  const setAll = (open: boolean) => setOverrides(Object.fromEntries(sections.map((s) => [s.id, open])));
  const jump = (id: string) => {
    setOverrides((o) => ({ ...o, [id]: true }));
    const calm = window.matchMedia('(prefers-reduced-motion: reduce)').matches;
    requestAnimationFrame(() => document.getElementById(id)?.scrollIntoView({ behavior: calm ? 'auto' : 'smooth' }));
  };
  return { overrides, setOverrides, isOpen, allOpen, setAll, jump };
}
