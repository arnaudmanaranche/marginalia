// @ts-check
import { z } from '@hono/zod-openapi';
import { ReviewId } from '@worldia/marginalia-contract';
import { locate } from './context.mjs';

export const slug = z.object({ slug: ReviewId });
export const badSlug = (c) => c.json({ error: 'bad slug' }, 400);
const notTracked = (c) => c.json({ error: 'no tracked merge request for this review' }, 404);

// The tracked MR of a review id ({ project, slug, mr }), or `{ reply }`: the answer to give instead.
/** @returns {Promise<any>} */
export async function tracked(c, id) {
  const found = await locate(id);
  if (!found) return { reply: badSlug(c) };
  if (!found.mr) return { reply: notTracked(c) };
  return found;
}
