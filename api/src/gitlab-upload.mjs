// @ts-check
// Images that GitLab notes embed live behind the login (`/uploads/<secret>/<file>`),
// so the browser cannot load them; the studio fetches them with the token instead.
// Pure: no config or I/O, so it is tested on plain strings.

const UPLOAD_PATH = /^\/(?:-\/project\/\d+\/)?(?:[^?#]*?\/)?uploads\/([0-9a-f]{16,64})\/([^/?#]+)$/i;

// The API-side path of an uploaded file, or null when `src` is not an upload of this GitLab.
export function uploadFetchPath(src, baseUrl, projectId) {
  let path;
  try {
    const url = new URL(src, baseUrl);
    if (url.origin !== new URL(baseUrl).origin) return null;
    path = decodeURIComponent(url.pathname);
  } catch {
    return null;
  }
  const m = path.match(UPLOAD_PATH);
  if (!m) return null;
  const root = /^\d+$/.test(projectId) ? `/-/project/${projectId}` : `/${projectId}`;
  return `${root}/uploads/${m[1]}/${encodeURIComponent(m[2])}`;
}
