import type { Collection } from 'discord.js';
import { t } from 'i18next';

import { getFilesFrom } from 'utility/files';
import { logger } from 'utility/logger';

/** What a button or select handler has to have to be loaded. */
interface ComponentHandler {
  options: { customId: string; execute: unknown };
}

/** Whether a file's default export is a button or select handler. */
const isComponentHandler = (value: unknown): value is ComponentHandler =>
  typeof value === 'object' &&
  value !== null &&
  typeof (value as ComponentHandler).options === 'object' &&
  (value as ComponentHandler).options !== null &&
  'customId' in (value as ComponentHandler).options &&
  'execute' in (value as ComponentHandler).options;

/**
 * Load the button or select handlers in a folder into their collection, by custom ID. Cleared first, so reloading doesn't keep removed ones.
 * @param invalid The log text for a file that isn't a handler.
 */
export async function loadComponents<T extends ComponentHandler>(
  folder: string,
  handlers: Collection<string, T>,
  invalid: 'system.button.invalid' | 'system.selectMenu.invalid',
) {
  handlers.clear();
  const tableData: { file: string; customId: string; valid: boolean }[] = [];
  const startTime = performance.now();
  const filePaths = await getFilesFrom(folder);

  await Promise.all(
    filePaths.map(async (filePath) => {
      const handler = ((await import(`${filePath}?update=${Date.now()}`)) as { default: unknown }).default;
      const file = filePath.split('/').slice(-2).join('/');
      if (isComponentHandler(handler)) {
        handlers.set(handler.options.customId, handler as T);
        tableData.push({ file, customId: handler.options.customId, valid: true });
      } else {
        // So the files counted are only the ones loaded
        filePaths.splice(filePaths.indexOf(filePath), 1);
        logger.warn(t(invalid, { file: filePath }));
        tableData.push({ file, customId: '?', valid: false });
      }
    }),
  );

  return { files: filePaths, tableData, duration: performance.now() - startTime, count: handlers.size };
}
