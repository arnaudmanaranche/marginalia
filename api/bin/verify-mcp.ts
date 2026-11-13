#!/usr/bin/env node
// The verify tool server: started by `claude` for the verify stage (--mcp-config), it serves `run` and
// `write_file` over stdio and starts the disposable runner on the first command. It reads a JSON
// file whose path is its only argument (the bot wrote it: image, workdir, limits, the recipe's
// steps, hosts, docker, egress) and removes the container when the stage ends.
import { readFileSync } from 'node:fs';
import { mkdir, realpath, writeFile } from 'node:fs/promises';
import { dirname, join, sep } from 'node:path';
import { createInterface } from 'node:readline';
import { MAX_FILE_BYTES, newFilePath } from '../src/verify-files.ts';
import { handleMessage } from '../src/verify-mcp-protocol.ts';
import { browser } from '../src/verify-browse-run.ts';
import { startRunner, type Runner } from '../src/verify-runner.ts';

const config = JSON.parse(readFileSync(process.argv[2], 'utf8'));
let runner: Promise<Runner> | null = null;
const getRunner = () => (runner ??= startRunner(config));

// The browse tool exists only for a project whose recipe says where it is served (ADR 0010).
const browse = config.browser ? browser({ runner: getRunner, steps: config.steps, hosts: config.hosts ?? [], evidenceDir: config.evidenceDir ?? null }) : undefined;

const handlers = {
  browse,
  run: async (command: string) => (await getRunner()).exec(command),
  writeFile: async (rel: string, content: string) => {
    const p = newFilePath(rel);
    if (!p.ok) return p;
    if (Buffer.byteLength(content) > MAX_FILE_BYTES) return { ok: false, error: `a file over ${MAX_FILE_BYTES} bytes` };
    const target = join(config.workdir, p.path);
    try {
      await mkdir(dirname(target), { recursive: true });
      // A symlink in the copy could lead out of it: the folder must really be inside.
      const root = await realpath(config.workdir);
      const folder = await realpath(dirname(target));
      if (folder !== root && !folder.startsWith(root + sep)) return { ok: false, error: 'that folder leads outside the project' };
      await writeFile(target, content, { flag: 'wx' });
      return { ok: true };
    } catch (err) {
      return { ok: false, error: err.code === 'EEXIST' ? 'it already exists: an existing file cannot be changed' : String(err.message).slice(0, 120) };
    }
  },
};

const stopAll = async () => { await (await runner?.catch(() => null))?.stop(); process.exit(0); };
process.on('SIGTERM', stopAll);
process.on('SIGINT', stopAll);

const lines = createInterface({ input: process.stdin });
lines.on('line', async (line) => {
  let msg: any;
  try { msg = JSON.parse(line); } catch { return; }
  const answer = await handleMessage(msg, handlers).catch((err) => ({ jsonrpc: '2.0', id: msg?.id ?? null, error: { code: -32603, message: String(err.message).slice(0, 200) } }));
  if (answer) process.stdout.write(`${JSON.stringify(answer)}\n`);
});
lines.on('close', stopAll);
