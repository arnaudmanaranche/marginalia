import { mrPath } from './gitlab-http.ts';

// What answering a mention needs of GitLab: who may ask, and a reply in the thread the mention
// came in. `client` is a GitLab REST client (gitlab-http.ts).
export function mentionOpsOf(client: any) {
  return {
    // The user's access level in the project, inherited access included (30 is Developer);
    // 0 when they are no member. The search is by name, so the username is matched exactly.
    async memberAccessLevel(project: any, username: string) {
      const found = await client.request(`/projects/${project.encodedId}/members/all?query=${encodeURIComponent(username)}`);
      return found.find((m: any) => m.username === username)?.access_level ?? 0;
    },
    // A note posted at once, as the token's owner (the bot account), into an existing thread.
    replyToDiscussion: (project: any, iid: any, discussionId: string, body: string) => client.request(`${mrPath(project, iid)}/discussions/${discussionId}/notes`, { method: 'POST', body: JSON.stringify({ body }) }),
  };
}
