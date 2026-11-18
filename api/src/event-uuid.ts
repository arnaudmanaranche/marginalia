import { createHash } from 'node:crypto';

// The same seed always gets the same id, so a backfill and the live event of one run are one event
// to PostHog (it de-duplicates on uuid). A v5-shaped UUID from a hash of `seed`.
export function eventUuid(seed: string) {
  const h = createHash('sha1').update(seed).digest('hex');
  const variant = ((parseInt(h.slice(16, 18), 16) & 0x3f) | 0x80).toString(16);
  return `${h.slice(0, 8)}-${h.slice(8, 12)}-5${h.slice(13, 16)}-${variant}${h.slice(18, 20)}-${h.slice(20, 32)}`;
}
