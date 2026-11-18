// The key a posted comment, a dismissed one and a proposal are stored under: `<projectKey>/<review slug>:<comment id>`.
export const postedKey = (projectKey: string, slug: string, id: string) => `${projectKey}/${slug}:${id}`;
