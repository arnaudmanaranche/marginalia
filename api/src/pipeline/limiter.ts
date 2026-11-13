// At most `n` tasks at once, the others waiting their turn in the order they asked: a finished task
// hands its place straight to the next in line. Pure.
export function createLimiter(n: number) {
  let active = 0;
  const waiting: (() => void)[] = [];
  return async function limit<T>(task: () => Promise<T>): Promise<T> {
    if (active >= n) await new Promise<void>((resolve) => waiting.push(resolve));
    else active += 1;
    try { return await task(); } finally {
      const next = waiting.shift();
      if (next) next(); else active -= 1;
    }
  };
}
