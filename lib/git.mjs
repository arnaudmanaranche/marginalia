// @ts-check
import { execFileAsync } from './exec.mjs';
import { commitEnv } from './git-identity.mjs';

// The one way the bot runs git in a repository. Every caller used to carry its own copy of this
// (trimming, buffers, environment); what a command needs of the spawn is decided here:
// - a `commit` is made as me (git-identity.mjs): the fixes are pushed under my name;
// - `env` adds to the process environment, `hooks: false` runs no hook of the repo;
// - a failed command throws, with git's stderr in the message.
// run() gives trimmed stdout, ok() whether it succeeded, exit() the exit code for the commands
// where a non-zero one is an answer (`merge-tree` exits 1 for "it conflicts").
/** @param {string} cwd @param {{ env?: Record<string, string>, hooks?: boolean, timeout?: number, maxBuffer?: number }} [opts] */
export function gitIn(cwd, { env = {}, hooks = true, timeout, maxBuffer = 20 * 1024 * 1024 } = {}) {
  /** @param {string[]} args */
  const spawn = async (args) => execFileAsync('git', hooks ? args : ['-c', 'core.hooksPath=/dev/null', ...args], {
    cwd,
    maxBuffer,
    ...(timeout && { timeout }),
    env: { ...(args[0] === 'commit' ? await commitEnv() : process.env), ...env },
  });
  return {
    /** @param {string[]} args */
    run: async (...args) => String((await spawn(args)).stdout).trim(),
    /** @param {string[]} args */
    ok: (...args) => spawn(args).then(() => true, () => false),
    /** @param {string[]} args @returns {Promise<{ code: number, stdout: string }>} */
    exit: (...args) => spawn(args).then(
      ({ stdout }) => ({ code: 0, stdout: String(stdout) }),
      (err) => (typeof err.code === 'number' ? { code: err.code, stdout: String(err.stdout ?? '') } : Promise.reject(err)),
    ),
  };
}
