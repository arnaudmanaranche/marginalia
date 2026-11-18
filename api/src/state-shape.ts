// The key a posted comment, a dismissed finding and a fixed one are stored under (a proposal is matched against it): `<projectKey>/<review slug>:<comment id>`.
export const postedKey = (projectKey: string, slug: string, id: string) => `${projectKey}/${slug}:${id}`;
