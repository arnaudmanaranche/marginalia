import { cp, stat } from 'node:fs/promises';
import { logger } from './logger.ts';

// Reviews used to be written in the reviewed repository (`.claude/reviews`), where a clean or a
// branch switch could wipe them. They live in Marginalia's data now: what an earlier install left in
// the repository is copied over once, never overwriting a review already here, never deleted there.
/** @param {{ key: string, reviewsDir: string, legacyReviewsDir: string }} project */
export async function moveReviewsHome(project: { key: string; reviewsDir: string; legacyReviewsDir: string }) {
  if (!(await stat(project.legacyReviewsDir).then((s) => s.isDirectory(), () => false))) return false;
  await cp(project.legacyReviewsDir, project.reviewsDir, { recursive: true, force: false, errorOnExist: false });
  logger.info({ project: project.key, from: project.legacyReviewsDir, to: project.reviewsDir }, 'Copied the reviews kept in the repository');
  return true;
}
