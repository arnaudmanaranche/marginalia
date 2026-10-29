// Git over HTTPS with the GitLab token, for places where SSH keys are a nuisance (a container).
// `url.<https>.insteadOf <ssh>` rewrites the remotes the repos already have, and a credential
// helper hands git the token at the moment it asks, so the token is never written to a gitconfig
// or put in the environment (where it would reach the Claude runs). Pure: strings in, strings out.

/** @param {string} baseUrl e.g. https://git.example.com or https://git.example.com:8443 */
export function httpsRewrites(baseUrl) {
  const url = new URL(baseUrl);
  const https = `${url.origin}/`;
  // The SSH forms of the same host: scp-like and ssh://, with or without a port.
  return [
    { key: `url.${https}.insteadOf`, value: `git@${url.hostname}:` },
    { key: `url.${https}.insteadOf`, value: `ssh://git@${url.hostname}/` },
    ...(url.port ? [] : [{ key: `url.${https}.insteadOf`, value: `ssh://git@${url.hostname}:22/` }]),
  ];
}

/**
 * What a git credential helper answers to `get`: the token for the GitLab host, nothing for any
 * other host (so it is never sent elsewhere). `input` is git's `key=value` lines.
 * @param {string} input @param {string} baseUrl @param {string} token
 */
export function credentialResponse(input, baseUrl, token) {
  const asked = Object.fromEntries(input.split('\n').filter((l) => l.includes('=')).map((l) => [l.slice(0, l.indexOf('=')), l.slice(l.indexOf('=') + 1)]));
  const gitlab = new URL(baseUrl);
  if (asked.protocol !== 'https' || asked.host !== gitlab.host || !token) return '';
  return `username=oauth2\npassword=${token}\n`;
}
