import { fetchMrHead } from './git-refs.ts';
import { warn } from './log.ts';
import { fileExists, reviewOutputPath } from './paths.ts';
import { layersAbove, stackPrompt } from './stack.ts';

// Fetches the layers above this MR into local refs (so the run can diff against
// them without network access) and lists the existing reviews of the stack, then
// renders the stack instructions. `stack` is { stacks, info } from poll.ts.
export async function buildStackPrompt(mr, stack) {
  const BOT_WORKTREE_DIR = mr.project.worktreeDir;
  const upperRefs: Record<string, string> = {};
  for (const iid of layersAbove(stack.stacks, mr.iid)) {
    const ref = `refs/marginalia/stack/${iid}`;
    try {
      await fetchMrHead(BOT_WORKTREE_DIR, iid, ref);
      upperRefs[iid] = ref;
    } catch (err) {
      warn(mr, `Could not fetch layer !${iid}, the review will not see it: ${err.message}`);
    }
  }
  const reviewPaths = {};
  for (const l of stack.info.layers) {
    const path = reviewOutputPath({ ...l, project: mr.project });
    if (l.iid !== mr.iid && (await fileExists(path))) reviewPaths[l.iid] = path;
  }
  return stackPrompt(mr, stack.info, { reviewPaths, upperRefs });
}
