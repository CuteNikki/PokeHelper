import { inspect } from 'node:util';

import pino from 'pino';

/** How many days of the bot's own log are kept, besides today's. Said in the privacy policy, so change it there too. */
const LOG_DAYS_KEPT = 14;

const customLevels = {
  trace: 10,
  debug: 20,
  cron: 25,
  info: 30,
  warn: 40,
  error: 50,
  fatal: 60,
};
const customLevelColors = {
  trace: 'blue',
  debug: 'cyan',
  cron: 'magenta',
  info: 'green',
  warn: 'yellow',
  error: 'red',
  fatal: 'redBright',
};
const customLevelsStr = Object.entries(customLevels)
  .map(([key, value]) => `${key}:${value}`)
  .join(',');

/** How deep causes of errors, and objects that aren't errors, are written out. */
const ERROR_DEPTH = 3;

/**
 * Anything thrown, in a form that can always be logged. Errors keep their details and cause. Anything else is described rather than
 * written out field by field, which fails on circular references (like a connection's error event) and hides what went wrong.
 */
function serializeError(value: unknown, depth = 0): Record<string, unknown> {
  if (!(value instanceof Error)) {
    return { type: value?.constructor?.name ?? typeof value, message: inspect(value, { depth: ERROR_DEPTH, breakLength: Infinity }) };
  }
  const details: Record<string, unknown> = { type: value.constructor.name, message: value.message, stack: value.stack };
  for (const key of ['code', 'status', 'method', 'url'] as const) {
    if (key in value) details[key] = (value as unknown as Record<string, unknown>)[key];
  }
  if (value.cause !== undefined && depth < ERROR_DEPTH) details.cause = serializeError(value.cause, depth + 1);
  return details;
}

export const logger = pino(
  {
    level: process.argv.includes('--debug') ? 'debug' : 'info',
    customLevels: customLevels,
    useOnlyCustomLevels: true,
    serializers: { err: (value: unknown) => serializeError(value) },
  },
  pino.transport({
    targets: [
      {
        target: 'pino-pretty',
        level: process.argv.includes('--debug') ? 'debug' : 'info',
        options: {
          colorize: true,
          customLevels: customLevelsStr,
          customColors: customLevelColors,
          ignore: 'pid,hostname',
          translateTime: 'SYS:yyyy/mm/dd HH:MM:ss',
        },
      },
      {
        // A file a day, like logs/pino.2026-11-04.1.log, and only the last 14 are kept, as the privacy policy says
        target: 'pino-roll',
        options: {
          file: `${process.cwd()}/logs/pino`,
          frequency: 'daily',
          dateFormat: 'yyyy-MM-dd',
          extension: '.log',
          mkdir: true,
          limit: { count: LOG_DAYS_KEPT },
        },
      },
    ],
  }),
);

/** How long the last lines get to be written before the process exits. */
const LOG_WRITE_TIME = 500;

/** Exit the process once the last lines are logged. They're written in the background, so exiting right away would lose them. */
export function exitAfterLogging(code: number) {
  logger.flush();
  setTimeout(() => process.exit(code), LOG_WRITE_TIME);
}

/** How many columns a text takes in the console, where emoji take two. */
function getStringWidth(str: string): number {
  const emojiRegex =
    /[\u{1F600}-\u{1F64F}\u{1F300}-\u{1F5FF}\u{1F680}-\u{1F6FF}\u{1F700}-\u{1F77F}\u{1F780}-\u{1F7FF}\u{1F800}-\u{1F8FF}\u{1F900}-\u{1F9FF}\u{1FA00}-\u{1FA6F}\u{1FA70}-\u{1FAFF}\u{2600}-\u{26FF}\u{2700}-\u{27BF}\u{2300}-\u{23FF}\u{2B50}]/u;
  return [...str].reduce((width, char) => {
    return width + (emojiRegex.test(char) ? 2 : 1);
  }, 0);
}

/** Rows as a table drawn with box characters, with the keys of the first row as the headers, like for what was loaded on start. */
export function table<T extends Record<string, unknown>>(data: T[]): string {
  if (!Array.isArray(data) || data.length === 0) return '[]';

  const firstRow = data[0];
  if (!firstRow) return '[]';

  const headers = Object.keys(firstRow);
  const rows = data.map((row) => headers.map((h) => String(row[h])));

  const colWidths = headers.map((h, i) => Math.max(getStringWidth(h), ...rows.map((r) => getStringWidth(r[i] ?? ''))));

  const padCell = (cell: string, width: number) => {
    const pad = width - getStringWidth(cell);
    return cell + ' '.repeat(pad);
  };

  const formatRow = (row: string[]) => '│ ' + row.map((cell, i) => padCell(cell, colWidths[i] ?? 0)).join(' │ ') + ' │';

  const topSeparator = '┌─' + colWidths.map((w) => '─'.repeat(w)).join('─┬─') + '─┐';

  const rowSeparator = '├─' + colWidths.map((w) => '─'.repeat(w)).join('─┼─') + '─┤';

  const bottomBorder = '└─' + colWidths.map((w) => '─'.repeat(w)).join('─┴─') + '─┘';

  const contentLines = [formatRow(headers), rowSeparator, ...rows.map(formatRow)];

  return [topSeparator, ...contentLines, bottomBorder].join('\n');
}

/** Logs a warning about something a job retries every run once, not every minute, until it works again. */
export class WarnOnce {
  private warned = new Set<string>();

  /** Log a warning about something, unless it was logged already and hasn't worked since. */
  warn(key: string, error: unknown, message: string) {
    if (this.warned.has(key)) return;
    this.warned.add(key);
    logger.warn(error, message);
  }

  /** It worked, so the next time it fails is logged again. */
  worked(key: string) {
    this.warned.delete(key);
  }
}
