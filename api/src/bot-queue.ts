import { createQueue } from './queue.ts';
import { getDb } from './store.ts';

// The process's queue, on the bot's database. Polls, mentions, Understand jobs and reruns all wait
// in it; the poller registers the handlers and starts it (poll.ts).
export const botQueue = createQueue({ db: getDb });
