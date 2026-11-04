import { inspect } from 'node:util';

import pino from 'pino';

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

/**
 * Logger utility using Pino for structured logging.
 * This logger is configured to log to both console and file.
 * The log level can be set to 'debug' or 'info' based on the command line argument.
 * @module logger
 */
/** How deep causes of errors, and objects that aren't errors, are written out. */
const ERROR_DEPTH = 3;

/**
 * Anything thrown, as something that can always be written to the log. Errors keep their type, message, stack and the details
 * Discord and the database add, and their cause. Anything else, like a connection's error event that points back at the connection,
 * is described instead of written out field by field, which fails on references back to itself and hides what went wrong.
 */
export function serializeError(value: unknown, depth = 0): Record<string, unknown> {
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
        target: 'pino/file',
        options: {
          destination: `${process.cwd()}/logs/pino.log`,
          mkdir: true,
        },
      },
    ],
  }),
);

/**
 * Calculates the width of a string, accounting for emojis and special characters.
 * @param str The string to calculate the width of.
 * @returns The width of the string in characters.
 */
function getStringWidth(str: string): number {
  const emojiRegex =
    /[\u{1F600}-\u{1F64F}\u{1F300}-\u{1F5FF}\u{1F680}-\u{1F6FF}\u{1F700}-\u{1F77F}\u{1F780}-\u{1F7FF}\u{1F800}-\u{1F8FF}\u{1F900}-\u{1F9FF}\u{1FA00}-\u{1FA6F}\u{1FA70}-\u{1FAFF}\u{2600}-\u{26FF}\u{2700}-\u{27BF}\u{2300}-\u{23FF}\u{2B50}]/u;
  return [...str].reduce((width, char) => {
    return width + (emojiRegex.test(char) ? 2 : 1);
  }, 0);
}

/**
 * Formats an array of objects into a table-like string.
 * @param data The array of objects to format.
 * @returns A string representing the formatted table.
 * @example
 * const data = [
 *   { name: 'Alice', age: 30, city: 'New York' },
 *   { name: 'Bob', age: 25, city: 'Los Angeles' },
 *   { name: 'Charlie', age: 35, city: 'Chicago' },
 * ];
 * console.log(table(data));
 * // Output:
 * // ┌─────────┬─────┬─────────────┐
 * // │ name    │ age │ city        │
 * // ├─────────┼─────┼─────────────┤
 * // │ Alice   │ 30  │ New York    │
 * // │ Bob     │ 25  │ Los Angeles │
 * // │ Charlie │ 35  │ Chicago     │
 * // └─────────┴─────┴─────────────┘
 * //
 */
export function table<T extends Record<string, unknown>>(data: T[]): string {
  if (!Array.isArray(data) || data.length === 0) return '[]';

  const firstRow = data[0];
  if (!firstRow) return '[]';

  const headers = Object.keys(firstRow);
  const rows = data.map((row) => headers.map((h) => String(row[h])));

  // Calculate column widths using custom string width function
  const colWidths = headers.map((h, i) => Math.max(getStringWidth(h), ...rows.map((r) => getStringWidth(r[i] ?? ''))));

  const padCell = (cell: string, width: number) => {
    const pad = width - getStringWidth(cell);
    return cell + ' '.repeat(pad);
  };

  const formatRow = (row: string[]) => '│ ' + row.map((cell, i) => padCell(cell, colWidths[i] ?? 0)).join(' │ ') + ' │';

  // Top separator
  const topSeparator = '┌─' + colWidths.map((w) => '─'.repeat(w)).join('─┬─') + '─┐';

  // Row separator (for the rows, between header and content)
  const rowSeparator = '├─' + colWidths.map((w) => '─'.repeat(w)).join('─┼─') + '─┤';

  // Bottom border
  const bottomBorder = '└─' + colWidths.map((w) => '─'.repeat(w)).join('─┴─') + '─┘';

  const contentLines = [formatRow(headers), rowSeparator, ...rows.map(formatRow)];

  return [topSeparator, ...contentLines, bottomBorder].join('\n');
}
