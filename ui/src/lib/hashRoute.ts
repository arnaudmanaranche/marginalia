// What the hash points at: a page or a review (`#/webapp/feat-x`), and, on a review, the finding to
// open it on (`#/webapp/feat-x?finding=f3`). Pure.

export interface HashRoute { slug: string | null; finding: string | null }

export function parseHash(hash: string): HashRoute {
  const raw = hash.replace(/^#\/?/, '');
  const q = raw.indexOf('?');
  const path = q < 0 ? raw : raw.slice(0, q);
  const finding = q < 0 ? null : new URLSearchParams(raw.slice(q + 1)).get('finding') || null;
  // A malformed escape (`#/%E0%A4`) makes decodeURIComponent throw: treat it as no review.
  try {
    return { slug: decodeURIComponent(path) || null, finding };
  } catch {
    return { slug: null, finding: null };
  }
}

// The route that opens a review on one of its findings.
export const findingRoute = (slug: string, findingId: string) => `${slug}?finding=${encodeURIComponent(findingId)}`;

// A project's context page (`context:webapp`).
export const CONTEXT_ROUTE = 'context:';
