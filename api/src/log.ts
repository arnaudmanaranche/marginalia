import { logger, stripAnsi } from './logger.ts';

export const isFancyTerminal = Boolean(process.stdout.isTTY) && !process.env.NO_COLOR;
/** @type {Record<'reset' | 'bold' | 'dim' | 'red' | 'green' | 'yellow' | 'cyan', string>} */
export const c: Record<'reset' | 'bold' | 'dim' | 'red' | 'green' | 'yellow' | 'cyan', string> = isFancyTerminal
  ? {
      reset: '\x1b[0m',
      bold: '\x1b[1m',
      dim: '\x1b[2m',
      red: '\x1b[31m',
      green: '\x1b[32m',
      yellow: '\x1b[33m',
      cyan: '\x1b[36m',
    }
  : (new Proxy({}, { get: () => '' }) as any);

// What the bot says about one MR: the project and iid ride along as fields, so a line reads
// `[webapp] [MR !123] ...` and JSON logs can be filtered on them.
const forMr = (mr) => logger.child({ project: mr.project?.key, iid: mr.iid });

export const log = (mr, msg) => forMr(mr).info(stripAnsi(msg));
export const warn = (mr, msg) => forMr(mr).warn(stripAnsi(msg));
export const logError = (mr, msg, err) => forMr(mr).error({ err }, stripAnsi(msg));
