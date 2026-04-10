import chalk from 'chalk';

import { logger } from 'utility/logger';

export async function measure<T>(label: string, fn: () => Promise<T>, indent = 0): Promise<T> {
  const pad = ' '.repeat(indent);
  const start = performance.now();
  const result = await fn();
  const end = performance.now();

  const duration = (end - start).toFixed(2);
  logger.info(`${pad}${chalk.green('✔')} ${chalk.cyan(label)} ${chalk.gray(`(${duration}ms)`)}`);

  return result;
}
