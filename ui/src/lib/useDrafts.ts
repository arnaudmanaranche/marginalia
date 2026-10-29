import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { deleteDraft, fetchDrafts, updateDraft, type DraftNote } from './api';
import { keys } from './queryKeys';

// The draft notes of the user's pending review, read from GitLab itself so drafts started in its own UI
// are listed too. Never served from the cache: what the dialog lists is what will be published.
export function useDrafts(slug: string) {
  return useQuery({ queryKey: keys.drafts(slug), queryFn: () => fetchDrafts(slug), gcTime: 0 });
}

// Edit or delete one draft, and keep the list in step without asking GitLab again.
export function useDraftMutations(slug: string, onChanged: () => void) {
  const client = useQueryClient();
  const apply = (id: number, next: DraftNote | null) => {
    client.setQueryData<DraftNote[]>(keys.drafts(slug), (all) => (all ?? []).flatMap((d) => (d.id !== id ? [d] : next ? [next] : [])));
    onChanged();
  };
  const update = useMutation({
    mutationFn: ({ draft, body }: { draft: DraftNote; body: string }) => updateDraft(slug, draft.id, body),
    onSuccess: (_, { draft, body }) => apply(draft.id, { ...draft, body }),
  });
  const remove = useMutation({
    mutationFn: (draft: DraftNote) => deleteDraft(slug, draft.id),
    onSuccess: (_, draft) => apply(draft.id, null),
  });
  return { update, remove };
}
