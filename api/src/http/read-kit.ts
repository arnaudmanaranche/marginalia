import { z } from '@hono/zod-openapi';
import { ReviewId } from '@worldia/marginalia-contract';
import { slugOfPath } from '../review-id.ts';
import { locate } from './context.ts';

export const slug = z.object({ slug: ReviewId });
export const badSlug = (c: any) => c.json({ error: 'bad slug' }, 400);
// `?limit=`: how many rows a list route returns, 1 to 200.
export const limitQuery = z.object({ limit: z.coerce.number().int().min(1).max(200).optional() });

// The title of each review the status lists, by review id.
export const titlesByReview = (status: any) => new Map<string, string>((status?.mrs ?? [])
  .filter((m: any) => m.reviewPath && m.title)
  .map((m: any) => [`${m.project}/${slugOfPath(m.reviewPath)}`, m.title]));

export const notTracked = (c: any) => c.json({ error: 'no tracked merge request for this review' }, 404);

// The tracked MR of a review id ({ project, slug, mr }), or `{ reply }`: the answer to give instead.
export async function tracked(c: any, id: string): Promise<{ project?: any; slug?: string; mr?: any; status?: any; reply?: any }> {
  const found = await locate(id);
  if (!found) return { reply: badSlug(c) };
  if (!found.mr) return { reply: notTracked(c) };
  return found;
}
