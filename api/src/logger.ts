import pino from 'pino';
import pretty from 'pino-pretty';

// What the bot says about itself. By default human lines, one per event, in the shape the log
// always had (`<time> INFO [project] [MR !12] message`; colour only in a terminal, so `tail -f`
// of the service log stays readable). MARGINALIA_LOG=json gives pino's JSON lines instead, for
// anything that parses logs; MARGINALIA_LOG_LEVEL (default info) turns it up or down.
// Fields (`project`, `iid`, `err`) are structured in JSON and folded into the line when pretty.
const ANSI = /\x1b\[[0-9;]*m|\x1b\]8;;[^\x07]*\x07/g;
export const stripAnsi = (text: string) => String(text).replace(ANSI, '');

/** @param {{ json?: boolean, level?: string, destination?: NodeJS.WritableStream, colorize?: boolean }} [options] */
export function createLogger({ json = false, level = 'info', destination = process.stdout, colorize = Boolean(process.stdout.isTTY) && !process.env.NO_COLOR } = {}) {
  const stream = json
    ? destination
    : pretty({
      destination,
      colorize,
      sync: true,
      ignore: 'pid,hostname,project,iid',
      translateTime: 'UTC:yyyy-mm-dd"T"HH:MM:ss.l"Z"',
      messageFormat: '{if project}[{project}] {end}{if iid}[MR !{iid}] {end}{msg}',
    });
  return pino({ level }, /** @type {any} */ (stream));
}

export const logger = createLogger({ json: process.env.MARGINALIA_LOG === 'json', level: process.env.MARGINALIA_LOG_LEVEL || 'info' });
