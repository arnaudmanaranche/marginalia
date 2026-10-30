import { QueryClient } from '@tanstack/react-query';

// Retrying is fetchJson's job (it knows which failures are worth another try and how long to wait),
// so the client itself never retries. Nothing refetches on window focus: the SSE stream and the
// list's own poll keep the page current, and a focus would re-ask GitLab for threads and diffs.
export function createQueryClient() {
  return new QueryClient({
    defaultOptions: {
      queries: { retry: false, refetchOnWindowFocus: false, staleTime: 0, gcTime: 5 * 60_000 },
      mutations: { retry: false },
    },
  });
}

// The app's client. A module-level one lets code outside React (the pending posts) use mutations too.
export const queryClient = createQueryClient();
