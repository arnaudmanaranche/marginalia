// Claude Code asks, once per folder, whether you trust it, and keeps the answer in its config file
// (`projects[<path>].hasTrustDialogAccepted`). Until it is yes, a headless run ignores the folder's
// own settings (the `.claude/settings*.json` allow-list the review commands rely on). Nobody can
// answer that dialog in a container, so the image records the answer for the repos the person
// listed in config.json, which is the same decision as accepting the dialog in their own checkout.
// Pure: the config object in, a new one out.

/**
 * @param {Record<string, any>} claudeJson contents of Claude's config file
 * @param {string[]} paths folders to mark as trusted
 * @returns {{ config: Record<string, any>, added: string[] }}
 */
export function withTrust(claudeJson, paths) {
  const projects = { ...(claudeJson.projects ?? {}) };
  const added: string[] = [];
  for (const path of paths) {
    if (projects[path]?.hasTrustDialogAccepted === true) continue;
    projects[path] = { ...projects[path], hasTrustDialogAccepted: true };
    added.push(path);
  }
  return { config: { ...claudeJson, projects }, added };
}
