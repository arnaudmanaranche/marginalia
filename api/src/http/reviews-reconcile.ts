import { ALLOW_POSTING } from '../config.ts';
import { projectByKey } from '../projects.ts';
import { posted } from '../posted.ts';
import { gitlab } from '../gitlab-api.ts';
import { broadcast, postQueue } from './context.ts';

// Forgets posted comments that were deleted on GitLab, so they can be posted
// again and lose their "Posted" badge. Throttled (the client polls every 30 s),
// serialized with posting, and a failed check never drops anything.
let lastReconcile = 0;
export async function reconcilePosted() {
  if (Date.now() - lastReconcile < 15_000) return;
  lastReconcile = Date.now();
  await postQueue(async () => {
    let changed = false;
    for (const { key, projectKey, info } of posted.entries()) {
      // A project that left the config is left alone.
      const project = projectByKey(projectKey);
      // With posting off, only the replies on my own MRs (which carry their thread) can exist.
      if (!info.iid || !project || (ALLOW_POSTING !== 'true' && !info.threadId)) continue;
      try {
        if (info.state === 'draft') {
          if (await gitlab.draftNoteExists(project, info.iid, info.draftId)) continue;
          // Gone from the drafts: published from GitLab itself, or deleted there.
          const noteId = info.body ? await gitlab.findPublishedNoteId(project, info.iid, info.body) : null;
          if (noteId) {
            posted.publish(key, `${info.mrUrl}#note_${noteId}`, info.at);
          } else posted.forget(key);
          changed = true;
          continue;
        }
        const noteId = info.url?.match(/#note_(\d+)$/)?.[1];
        if (noteId && !(await gitlab.mergeRequestNoteExists(project, info.iid, noteId))) {
          posted.forget(key);
          changed = true;
        }
      } catch {
        /* GitLab unreachable: keep it for now */
      }
    }
    if (changed) broadcast();
  }).catch(() => {});
}
