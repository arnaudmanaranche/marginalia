import type { Job } from './api';
import { keys } from './queryKeys';
import { useJson } from './useJson';

// The latest jobs of every line, newest first; kept current by the live events. Null while loading.
export function useJobs(): { jobs: Job[] | null; known: boolean; error: string | null; retry: () => void } {
  const { data, ...rest } = useJson(keys.jobs, '/api/jobs?limit=100', (r: { jobs: Job[] }) => r.jobs);
  return { jobs: data, ...rest };
}
