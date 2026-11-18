import type { PostedInfo } from './api';

// A posted comment is kept under its review and its id: the finding's, or a reviewer thread's.
export const postedKey = (slug: string, id: string) => `${slug}:${id}`;

// What was posted on one review.
export const postedFor = (posted: Record<string, PostedInfo>, slug: string): PostedInfo[] =>
  Object.entries(posted).filter(([key]) => key.startsWith(postedKey(slug, ''))).map(([, info]) => info);
