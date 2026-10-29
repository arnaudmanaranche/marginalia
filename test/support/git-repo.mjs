import { execFileSync } from 'node:child_process';
import { mkdtemp, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';

// A throwaway repo with a bare origin and one commit on `branch`: git is local and fast, so the
// git modules are tested against the real thing rather than a fake.
export async function makeRepo({ branch = 'feat/x', files = { 'a.txt': 'a\n' } } = {}) {
  const tmp = await mkdtemp(join(tmpdir(), 'marginalia-git-'));
  const origin = join(tmp, 'origin.git');
  const repo = join(tmp, 'repo');
  const git = (cwd, ...args) => execFileSync('git', ['-c', 'user.name=t', '-c', 'user.email=t@t', '-c', 'core.hooksPath=/dev/null', ...args], { cwd, stdio: 'pipe' }).toString().trim();
  git(tmp, 'init', '-q', '--bare', '--template=', origin);
  git(tmp, 'init', '-q', '-b', branch, '--template=', repo);
  git(repo, 'remote', 'add', 'origin', origin);
  for (const [name, text] of Object.entries(files)) await writeFile(join(repo, name), text);
  git(repo, 'add', '-A');
  git(repo, 'commit', '-qm', 'first');
  git(repo, 'push', '-q', 'origin', branch);
  return { tmp, origin, repo, git };
}
