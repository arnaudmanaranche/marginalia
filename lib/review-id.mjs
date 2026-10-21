// @ts-check
// A review is addressed in the studio as `<project key>/<slug>`: the slug alone (the
// review file's name, from the MR's branch) can repeat from one project to another.
// Pure: the projects are passed in.
const SLUG_RE = /^[\w.-]+$/;

export const reviewId = (project, slug) => `${project.key}/${slug}`;

// { project, slug } for a well-formed id of a known project, else null.
export function parseReviewId(id, projects) {
  if (typeof id !== 'string') return null;
  const at = id.indexOf('/');
  if (at < 1) return null;
  const project = projects.find((p) => p.key === id.slice(0, at));
  const slug = id.slice(at + 1);
  if (!project || !SLUG_RE.test(slug) || slug.includes('..')) return null;
  return { project, slug };
}

// The project whose GitLab path an upload URL (`/group/project/uploads/...`) points into,
// else the first one.
export function projectOfUpload(pathname, projects) {
  const path = decodeURIComponent(pathname);
  return projects.find((p) => !/^\d+$/.test(p.gitlabProjectId) && path.startsWith(`/${p.gitlabProjectId}/`)) ?? projects[0] ?? null;
}
