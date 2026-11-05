// The triage's fix commits as git logs them, read back into what the studio shows: which reviewer
// thread each answers (the trailer the triage writes), and whether it is the merge that settled the
// MR's conflicts. Pure: tested on plain log output.

export const THREAD_TRAILER = 'Marginalia-Thread';

// `git log` with these, records split by \x1e, fields by \x00: sha, parents, subject, thread trailer.
export const FIX_LOG_FORMAT = `%H%x00%P%x00%s%x00%(trailers:key=${THREAD_TRAILER},valueonly,separator=%x2C)%x1e`;

/** @param {string} out @returns {{ sha: string, subject: string, thread: string | null, merge: boolean }[]} */
export function parseFixLog(out: string) {
  return out.split('\x1e').map((r) => r.trim()).filter(Boolean).map((record) => {
    const [sha, parents = '', subject = '', thread = ''] = record.split('\0');
    return { sha, subject, thread: thread.split(',')[0].trim() || null, merge: parents.trim().split(/\s+/).length > 1 };
  });
}

// The fixes already on the MR branch, by thread: the commit to name in that thread's reply.
/** @param {{ sha: string, thread: string | null }[]} commits newest first */
export function landedByThread(commits: { sha: string, thread: string | null }[]) {
  const landed: { thread: string, sha: string }[] = [];
  for (const c of commits) if (c.thread && !landed.some((l) => l.thread === c.thread)) landed.push({ thread: c.thread, sha: c.sha });
  return landed;
}
