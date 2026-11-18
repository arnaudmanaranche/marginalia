import { readdir } from 'node:fs/promises';
import { join } from 'node:path';

// The layout of the run journal (run-journal.ts): <root>/<project>/<review>/<id>.json holds a
// run's trace; <id>.doctor.json and <id>.fix.json are what came after it, not runs of their own.
const isTraceFile = (name: string) => name.endsWith('.json') && !/\.(doctor|fix)\.json$/.test(name);

async function subdirs(path: string) {
  return (await readdir(path, { withFileTypes: true }).catch((err) => { if (err?.code === 'ENOENT') return []; throw err; })).filter((e) => e.isDirectory()).map((e) => e.name);
}

// The run ids kept in one review's directory, newest first; [] when there is none.
export async function traceIdsIn(dir: string) {
  const names = await readdir(dir).catch(() => [] as string[]);
  return names.filter(isTraceFile).map((n) => n.slice(0, -'.json'.length)).sort().reverse();
}

// Every review directory of the journal, of `projects` or of all the projects in it.
export async function reviewDirs(root: string, projects?: string[]) {
  const found: { project: string; review: string; dir: string }[] = [];
  for (const project of projects ?? await subdirs(root)) {
    for (const review of await subdirs(join(root, project))) found.push({ project, review, dir: join(root, project, review) });
  }
  return found;
}
