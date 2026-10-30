// Runs one thing at a time, in the order asked: a poll and the mentions the webhook announces
// share the bot's worktrees, so none of them may overlap. A failure does not stop the line.
export function createSerial() {
  let tail: Promise<unknown> = Promise.resolve();
  return {
    run<T>(job: () => Promise<T>): Promise<T> {
      const next = tail.then(job, job);
      tail = next.catch(() => {});
      return next;
    },
  };
}

export const serial = createSerial();
