import { z } from '@hono/zod-openapi';
import { ReviewId } from '@worldia/marginalia-contract';
import { locate } from './context.ts';

export const slug = z.object({ slug: ReviewId });
export const badSlug = (c: any) => c.json({ error: 'bad slug' }, 400);
export const notTracked = (c: any) => c.json({ error: 'no tracked merge request for this review' }, 404);

// The tracked MR of a review id ({ project, slug, mr }), or `{ reply }`: the answer to give instead.
export async function tracked(c: any, id: string): Promise<{ project?: any; slug?: string; mr?: any; status?: any; reply?: any }> {
  const found = await locate(id);
  if (!found) return { reply: badSlug(c) };
  if (!found.mr) return { reply: notTracked(c) };
  return found;
}
