// @ts-check
import { getDb } from './store.mjs';
import { readPosted, writePosted } from './db-store.mjs';

// Record of comments posted from the studio, keyed by `<project>/<review slug>:<comment id>`,
// so the same comment can't be posted twice. { at, iid, url }
export async function loadPosted() {
  return readPosted(getDb());
}

export async function savePosted(posted) {
  writePosted(getDb(), posted);
}
