#!/usr/bin/env node
// A scripted `docker`: records its arguments (one JSON line each) in FAKE_DOCKER_LOG, and for `exec`
// answers by the command: "sleep" hangs, "fail" exits 2, "big" prints a lot, anything else says ok.
import { appendFileSync } from 'node:fs';
const args = process.argv.slice(2);
appendFileSync(process.env.FAKE_DOCKER_LOG, `${JSON.stringify(args)}\n`);
if (args[0] === 'exec') {
  // A program with its arguments arrives as one `sh -c` string of quoted words: the last word answers.
  const command = args.at(-1).startsWith("'") ? args.at(-1).match(/'([^']*)'/g).map((w) => w.slice(1, -1)).at(-1) : args.at(-1);
  if (command.startsWith('/missing')) process.exit(1);
  else if (command.startsWith('sleep')) setTimeout(() => {}, 60_000);
  else if (command.startsWith('fail')) { process.stderr.write('boom\n'); process.exit(2); }
  else if (command.startsWith('big')) { process.stdout.write('x'.repeat(50_000)); }
  else process.stdout.write('ok\n');
}
