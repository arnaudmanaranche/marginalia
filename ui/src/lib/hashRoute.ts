// What the hash points at: a page or a review (`#/webapp/feat-x`), and, on a review, the finding to
// open it on (`#/webapp/feat-x?finding=f3`) or the earlier version on screen (`?version=<id>`); on a project context, the critical path to point at
// (`#/context:webapp?path=Checkout`). Pure.

export interface HashRoute { slug: string | null; finding: string | null; path: string | null; version: string | null }

export function parseHash(hash: string): HashRoute {
  const raw = hash.replace(/^#\/?/, '');
  const q = raw.indexOf('?');
  const path = q < 0 ? raw : raw.slice(0, q);
  const query = new URLSearchParams(q < 0 ? '' : raw.slice(q + 1));
  const finding = query.get('finding') || null;
  const focus = query.get('path') || null;
  const version = query.get('version') || null;
  // A malformed escape (`#/%E0%A4`) makes decodeURIComponent throw: treat it as no review.
  try {
    return { slug: decodeURIComponent(path) || null, finding, path: focus, version };
  } catch {
    return { slug: null, finding: null, path: null, version: null };
  }
}

// The route that opens a review on one of its findings.
export const findingRoute = (slug: string, findingId: string) => `${slug}?finding=${encodeURIComponent(findingId)}`;

// The route of a review showing one of its earlier versions; `null` is the latest.
export const versionRoute = (slug: string, versionId: string | null) => (versionId ? `${slug}?version=${encodeURIComponent(versionId)}` : slug);

// The settings page.
export const SETTINGS_ROUTE = 'settings';

// A project's context page (`context:webapp`), and the same page opened on one of its critical paths, by name.
export const CONTEXT_ROUTE = 'context:';
export const criticalPathRoute = (projectKey: string, name: string) => `${CONTEXT_ROUTE}${projectKey}?path=${encodeURIComponent(name)}`;
