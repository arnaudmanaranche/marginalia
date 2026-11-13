import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { fetchJson } from './fetchRetry';
import { CONTEXT_ROUTE } from './hashRoute';

// A project's learned context (glossary, stack, features, critical paths), as the bot stores it,
// and the calls to read it, approve the draft and learn the project again.

export interface ContextSource { kind: 'file' | 'ticket' | 'page' | 'thread' | 'query' | 'url'; ref: string }
export interface ContextItem { name: string; summary: string; where?: string[]; sources: ContextSource[] }
export interface ContextTerm extends ContextItem { codeNames?: string[]; avoid?: string[] }
export interface ContextCriticalPath extends ContextItem { rank: number; steps?: string[]; tests?: string[]; fragile?: string[] }
export interface ContextRecipeStep { purpose: 'setup' | 'run' | 'test'; run: string; summary: string; sources: ContextSource[] }
// How to run the project to reproduce a finding. Approving the context approves these commands.
export interface ContextRecipe { steps: ContextRecipeStep[]; hosts?: string[]; notes?: string }
export interface ProjectContext { summary: string; glossary: ContextTerm[]; stack: ContextItem[]; features: ContextItem[]; criticalPaths: ContextCriticalPath[]; verification?: ContextRecipe }
export interface StoredContext {
  project: string; commit: string; learnedAt: string; state: 'draft' | 'approved';
  approvedBy: string | null; approvedAt: string | null; context: ProjectContext;
}
export interface ContextState { project: string; draft: StoredContext | null; approved: StoredContext | null; learning: boolean }
export interface ContextSummary { project: string; draftLearnedAt: string | null; approvedAt: string | null }

// `#/context:<key>`: never a review id, which always holds a slash.
export const contextRoute = (key: string) => `${CONTEXT_ROUTE}${key}`;
export const contextKeyOf = (route: string | null) => (route?.startsWith(CONTEXT_ROUTE) ? route.slice(CONTEXT_ROUTE.length) : null);

// A draft newer than what reviews use waits for a person.
export const waitsForApproval = (s: ContextSummary) => s.draftLearnedAt !== null;

// Under 'runs' (live keys): an Understand job ending, or an approval, refreshes them.
const keys = { one: (key: string) => ['runs', '*', 'context', key] as const, all: ['runs', '*', 'contexts'] as const };

// The projects' contexts; `known` once the list came, or could not (an error says nothing waits there).
export function useContexts(): { contexts: ContextSummary[]; known: boolean } {
  const query = useQuery({ queryKey: keys.all, queryFn: ({ signal }) => fetchJson<{ contexts: ContextSummary[] }>('/api/contexts', { signal }).then((r) => r.contexts) });
  return { contexts: query.data ?? [], known: !query.isPending || query.isError };
}

export function useProjectContext(key: string) {
  const query = useQuery({ queryKey: keys.one(key), queryFn: ({ signal }) => fetchJson<ContextState>(`/api/projects/${encodeURIComponent(key)}/context`, { signal }) });
  return { state: query.data ?? null, error: query.error ? String(query.error.message ?? query.error) : null, retry: () => void query.refetch() };
}

async function post(path: string): Promise<ContextState> {
  const res = await fetch(path, { method: 'POST', headers: { 'content-type': 'application/json' }, body: '{}' });
  const body = await res.json().catch(() => ({}));
  if (!res.ok) throw new Error((body as { error?: string }).error ?? `HTTP ${res.status}`);
  return body as ContextState;
}

export function useContextActions(key: string) {
  const client = useQueryClient();
  const done = (state: ContextState) => {
    client.setQueryData(keys.one(key), state);
    void client.invalidateQueries({ queryKey: keys.all });
  };
  const approve = useMutation({ mutationFn: () => post(`/api/projects/${encodeURIComponent(key)}/context/approve`), onSuccess: done });
  const learn = useMutation({ mutationFn: () => post(`/api/projects/${encodeURIComponent(key)}/understand`), onSuccess: done });
  return { approve, learn };
}
