// What the hash points at: a page or a review (`#/webapp/feat-x`), and, on a review, the finding to
// open it on (`#/webapp/feat-x?finding=f3`) or the earlier version on screen (`?version=<id>`); on a project context, the critical path to point at
// (`#/context:webapp?path=Checkout`).

interface HashRoute { slug: string | null; finding: string | null; path: string | null; version: string | null }

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

export const SETTINGS_ROUTE = 'settings';
export const APPROVALS_ROUTE = 'approvals';
// Retired: Home is the feed now (ADR 0007), so an old `#/jobs` link lands there.
export const JOBS_ROUTE = 'jobs';
const CONTEXT_ROUTE = 'context:';

// `#/context:<key>` is a project's context page: never a review id, which always holds a slash.
export const contextRoute = (key: string) => `${CONTEXT_ROUTE}${key}`;
export const contextKeyOf = (route: string | null) => (route?.startsWith(CONTEXT_ROUTE) ? route.slice(CONTEXT_ROUTE.length) : null);

// The same page opened on one of its critical paths, by name.
export const criticalPathRoute = (projectKey: string, name: string) => `${contextRoute(projectKey)}?path=${encodeURIComponent(name)}`;

// Whether a route is a review rather than a page.
export const isReviewRoute = (slug: string | null) => slug !== null && slug !== SETTINGS_ROUTE && slug !== APPROVALS_ROUTE && slug !== JOBS_ROUTE && contextKeyOf(slug) === null;

// The link to a route; no route is Home.
export const hrefOf = (route: string | null) => (route ? `#/${route}` : '#/');
