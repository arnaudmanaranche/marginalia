import { createQueue } from './queue.ts';
import { getDb } from './store.ts';

// The process's queue, on the bot's database. Polls, mentions, Understand jobs and reruns all wait
// in it; the poller registers the handlers and starts it (poll.ts). QUEUE_WORKERS: how many
// projects run at once (each one task at a time); 2 by default, as many runs of Claude together.
export const DEFAULT_WORKERS = 2;
export const queueWorkers = (env = process.env) => Math.max(1, Math.floor(Number(env.QUEUE_WORKERS)) || DEFAULT_WORKERS);
export const botQueue = createQueue({ db: getDb, workers: queueWorkers() });
