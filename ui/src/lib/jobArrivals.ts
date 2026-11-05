import { useEffect, useRef, useState } from 'react';
import type { Job } from './api';

export const jobKey = (j: Job) => `${j.slug}:${j.id}`;

// The jobs `known` has not seen. The first list (`known` null) is what was there when the page
// opened: nothing in it is new.
export function newJobs(known: Set<string> | null, jobs: Job[]): string[] {
  return known ? jobs.map(jobKey).filter((k) => !known.has(k)) : [];
}

// Jobs that started while the page is open, marked until they have been in front of the person for a
// few seconds: a job that arrived while the tab was hidden is still marked when they come back.
export function useFreshJobs(jobs: Job[], holdMs = 8000): (job: Job) => boolean {
  const known = useRef<Set<string> | null>(null);
  const [fresh, setFresh] = useState<ReadonlySet<string>>(new Set());
  useEffect(() => {
    if (jobs.length === 0 && known.current === null) return;
    const arrived = newJobs(known.current, jobs);
    known.current = new Set([...(known.current ?? []), ...jobs.map(jobKey)]);
    if (arrived.length) setFresh((prev) => new Set([...prev, ...arrived]));
  }, [jobs]);
  useEffect(() => {
    if (fresh.size === 0) return;
    let timer: number | undefined;
    const arm = () => {
      window.clearTimeout(timer);
      if (!document.hidden) timer = window.setTimeout(() => setFresh(new Set()), holdMs);
    };
    arm();
    document.addEventListener('visibilitychange', arm);
    return () => {
      window.clearTimeout(timer);
      document.removeEventListener('visibilitychange', arm);
    };
  }, [fresh, holdMs]);
  return (job) => fresh.has(jobKey(job));
}
