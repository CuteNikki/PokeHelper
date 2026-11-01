import { logger } from 'utility/logger';

export async function measure<T>(label: string, fn: () => Promise<T> | T, indent = 0): Promise<T> {
  const pad = ' '.repeat(indent);
  const start = performance.now();
  const result = await fn();
  const end = performance.now();

  const duration = (end - start).toFixed(2);
  // No colors in the message itself: pino-pretty colors the console, and the log file should stay plain text
  logger.info(`${pad}✔ ${label} (${duration}ms)`);

  return result;
}
