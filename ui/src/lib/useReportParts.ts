import { useEffect, useMemo } from 'react';
import type { ReviewContent } from './api';
import { scrollBehavior } from './motion';
import { squash } from './reviewComments';
import { extractMeta, rankOf, SUPPORTING_RANK, splitSections } from './reviewSections';
import { stopsToRead } from './stops';

// What a review is read as: its tour (the chapters with something to act on), the findings no chapter holds,
// and the report's own sections in reading order.
export function useReportParts(markdown: string | null, shape: ReviewContent['shape'] | null, finding: string | null, title: string | undefined) {
  const meta = useMemo(() => extractMeta(markdown ?? ''), [markdown]);
  // The tour skips the chapters with nothing to act on (stops.ts): a clean chapter is not a stop.
  const stops = useMemo(() => stopsToRead(shape?.tour ?? [], shape?.findings ?? []), [shape]);
  // Findings the person can't reach otherwise: with a tour, the ones no chapter holds; without one,
  // those with no comment card in the report's own text.
  const loose = useMemo(() => {
    const findings = shape?.findings ?? [];
    if (stops.length) return findings.filter((f) => !stops.some((s) => s.findingIds.includes(f.id)));
    const text = squash(markdown ?? '');
    return findings.filter((f) => !f.comment || !text.includes(squash(f.comment)));
  }, [markdown, shape, stops]);
  // A link to a finding no chapter holds (`?finding=`) opens the findings card on it, in view and lit up.
  const looseFocus = useMemo(() => (finding && loose.some((f) => f.id === finding) ? { id: finding, source: 'diff' as const, nonce: 1 } : null), [finding, loose]);
  useEffect(() => {
    if (!looseFocus) return;
    requestAnimationFrame(() => document.getElementById('findings')?.scrollIntoView({ block: 'start', behavior: scrollBehavior() }));
  }, [looseFocus]);
  const { intro: rawIntro, sections } = useMemo(() => splitSections(meta.markdown), [meta]);
  // The report's own `# title` repeats the header above it: said once.
  const intro = useMemo(() => {
    const h1 = rawIntro.match(/^\s*#\s+(.+)\n?/);
    return h1 && h1[1].trim() === title?.trim() ? rawIntro.slice(h1[0].length) : rawIntro;
  }, [rawIntro, title]);
  const ordered = useMemo(
    () => sections.map((s, i) => ({ s, i })).sort((a, b) => rankOf(a.s.title) - rankOf(b.s.title) || a.i - b.i).map((x) => x.s),
    [sections],
  );
  const firstSupporting = ordered.find((s) => rankOf(s.title) === SUPPORTING_RANK && ordered.some((o) => rankOf(o.title) < SUPPORTING_RANK))?.id;
  return { stops, loose, looseFocus, intro, sections, ordered, firstSupporting };
}
