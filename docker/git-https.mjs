#!/usr/bin/env node
// Two jobs in one file, both for the container (see lib/git-https.mjs):
//   git-https.mjs setup   at start: point git at HTTPS for the GitLab host
//   git-https.mjs get     as git's credential helper: answer with the token
// The GitLab URL and token come from the environment, or else from config.json in the data dir.
// Without them it does nothing, so a setup that mounts SSH keys instead is left alone.
import { execFileSync } from 'node:child_process';
import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { credentialResponse, httpsRewrites } from '../lib/git-https.mjs';

process.env.MR_REVIEW_BOT_SKIP_CONFIG_CHECK = '1';
const { GITLAB_BASE_URL, GITLAB_TOKEN } = await import('../lib/config.mjs');
const [action] = process.argv.slice(2);

if (GITLAB_BASE_URL && GITLAB_TOKEN) {
  if (action === 'get') {
    process.stdout.write(credentialResponse(readFileSync(0, 'utf8'), GITLAB_BASE_URL, GITLAB_TOKEN));
  } else if (action === 'setup') {
    // Idempotent: clear what an earlier start wrote, then write it again.
    const git = (...args) => {
      try {
        execFileSync('git', ['config', '--global', ...args], { stdio: 'ignore' });
      } catch { /* the key was not set */ }
    };
    const rewrites = httpsRewrites(GITLAB_BASE_URL);
    git('--unset-all', 'credential.helper');
    for (const key of new Set(rewrites.map((r) => r.key))) git('--unset-all', key);
    git('--add', 'credential.helper', fileURLToPath(import.meta.url));
    for (const { key, value } of rewrites) git('--add', key, value);
    console.log(`git: ${new URL(GITLAB_BASE_URL).host} is reached over HTTPS with the GitLab token (SSH remotes are rewritten).`);
  }
}
