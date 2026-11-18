import { useMutation, useQueryClient } from '@tanstack/react-query';
import { sendJson } from './fetchRetry';
import { keys } from './queryKeys';
import { useJson } from './useJson';

// A project's learned context (glossary, stack, features, critical paths), as the bot stores it,
// and the calls to read it, approve the draft and learn the project again.

export interface ContextSource { kind: 'file' | 'ticket' | 'page' | 'thread' | 'query' | 'url'; ref: string }
export interface ContextItem { name: string; summary: string; where?: string[]; sources: ContextSource[] }
export interface ContextTerm extends ContextItem { codeNames?: string[]; avoid?: string[] }
export interface ContextCriticalPath extends ContextItem { rank: number; steps?: string[]; tests?: string[]; fragile?: string[] }
interface ContextRecipeStep { purpose: 'setup' | 'run' | 'test'; run: string; summary: string; sources: ContextSource[] }
// How to run the project to reproduce a finding. Approving the context approves these commands.
interface ContextRecipe { steps: ContextRecipeStep[]; hosts?: string[]; notes?: string }
export interface ProjectContext { summary: string; glossary: ContextTerm[]; stack: ContextItem[]; features: ContextItem[]; criticalPaths: ContextCriticalPath[]; verification?: ContextRecipe }
export interface StoredContext {
  project: string; commit: string; learnedAt: string; state: 'draft' | 'approved';
  approvedBy: string | null; approvedAt: string | null; context: ProjectContext;
}
export interface ContextState { project: string; draft: StoredContext | null; approved: StoredContext | null; learning: boolean }
interface ContextSummary { project: string; draftLearnedAt: string | null; approvedAt: string | null }

// A draft newer than what reviews use waits for a person.
export const waitsForApproval = (s: ContextSummary) => s.draftLearnedAt !== null;

// The projects' contexts; `known` once the list came, or could not (an error says nothing waits there).
export function useContexts(): { contexts: ContextSummary[]; known: boolean } {
  const { data, known } = useJson(keys.contexts, '/api/contexts', (r: { contexts: ContextSummary[] }) => r.contexts);
  return { contexts: data ?? [], known };
}

export function useProjectContext(key: string) {
  const { data, error, retry } = useJson<ContextState>(keys.context(key), `/api/projects/${encodeURIComponent(key)}/context`);
  return { state: data, error, retry };
}

export function useContextActions(key: string) {
  const client = useQueryClient();
  const done = (state: ContextState) => {
    client.setQueryData(keys.context(key), state);
    void client.invalidateQueries({ queryKey: keys.contexts });
  };
  const approve = useMutation({ mutationFn: () => sendJson<ContextState>('POST', `/api/projects/${encodeURIComponent(key)}/context/approve`), onSuccess: done });
  const learn = useMutation({ mutationFn: () => sendJson<ContextState>('POST', `/api/projects/${encodeURIComponent(key)}/understand`), onSuccess: done });
  return { approve, learn };
}
