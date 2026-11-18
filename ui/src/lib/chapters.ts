import type { Finding, TourStop } from './api';

const ORDER = ['critical', 'important', 'suggestion', 'info'] as const;

export function chapterSummary(stop: TourStop, findings: Finding[]) {
  const mine = findings.filter((f) => stop.findingIds.includes(f.id));
  return {
    count: mine.length,
    top: ORDER.find((level) => mine.some((f) => f.severity === level)) ?? null,
    threads: stop.threadIds?.length ?? 0,
  };
}
