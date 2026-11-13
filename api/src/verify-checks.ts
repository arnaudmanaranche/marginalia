// What `marginalia doctor` says of verification (ADR 0009), for a project that opted in: whether the
// runner can start (Docker answers, the image is there), and whether a person approved a recipe.
// Pure: each reading is tested on what the tools print. Nothing here stops a review: a finding that
// cannot be verified is `skipped`, and says why.

const firstLine = (text: unknown) => String(text ?? '').trim().split('\n').find(Boolean)?.slice(0, 160) ?? '';
const ok = (label: string, detail: string) => ({ label, level: 'ok' as const, detail });
const warn = (label: string, detail: string) => ({ label, level: 'warn' as const, detail });

/** @param {{ image: string, docker: { stdout?: string, error?: string | null }, imageProbe: { error?: string | null }, recipe: any, egress: { network: string, proxy: string } | null }} input */
export function verifyChecks({ image, docker, imageProbe, browserProbe = null, recipe, egress }: { browserProbe?: { error?: string | null } | null; image: string; docker: { stdout?: string; error?: string | null }; imageProbe: { error?: string | null }; recipe: any; egress: { network: string; proxy: string } | null }) {
  const checks = [];
  checks.push(docker.error ? warn('Docker', `does not answer (${firstLine(docker.error)}): findings are not verified`) : ok('Docker', `answers (server ${firstLine(docker.stdout) || 'unknown version'})`));
  if (!image) checks.push(warn('Runner image', 'VERIFY_RUNNER_IMAGE is not set: findings are not verified'));
  else checks.push(imageProbe.error ? warn('Runner image', `${image} is not available locally (${firstLine(imageProbe.error)}): docker pull it or build it`) : ok('Runner image', image));
  checks.push(recipe
    ? ok('Recipe', `${recipe.steps.length} step${recipe.steps.length > 1 ? 's' : ''} approved with the project context`)
    : warn('Recipe', 'the approved project context has no recipe: learn the project again, then approve it'));
  if (recipe?.browser) checks.push(browserProbe?.error ? warn('Browser', `the runner image has no agent-browser (${firstLine(browserProbe.error)}): build deploy/runner/Dockerfile.browser; findings are reproduced without a browser`) : ok('Browser', `the recipe serves ${recipe.browser.url}; the runner image has agent-browser`));
  const hosts = recipe?.hosts?.length ?? 0;
  if (hosts && !egress) checks.push(warn('Network', `the recipe names ${hosts} host${hosts > 1 ? 's' : ''} but no egress proxy is configured (VERIFY_EGRESS_NETWORK, VERIFY_EGRESS_PROXY): the runner stays offline`));
  return checks;
}
