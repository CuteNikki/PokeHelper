import { t } from 'i18next';

import type { Button } from 'classes/base/button';
import type { ExtendedClient } from 'classes/base/client';

import { getFilesFrom } from 'utility/files';
import { logger } from 'utility/logger';

/**
 * Loads buttons into the client.
 *
 * @param client - The ExtendedClient instance to load buttons into.
 */
export async function loadButtons(client: ExtendedClient) {
  // Clear the existing buttons collection to avoid duplicates when reloading
  // This is useful during development when buttons are frequently updated
  client.buttons.clear();

  const tableData: { file: string; customId: string; valid: boolean }[] = [];
  const startTime = performance.now();

  const filePaths = await getFilesFrom('src/buttons');

  // Use Promise.all to load all button files concurrently
  await Promise.all(
    filePaths.map(async (filePath) => {
      const button = (await import(`${filePath}?update=${Date.now()}`)).default;

      if (isValidButton(button)) {
        // Add the button to the buttons collection of the client
        client.buttons.set(button.options.customId, button);

        tableData.push({ file: filePath.split('/').slice(-2).join('/'), customId: button.options.customId, valid: true });
      } else {
        // Remove the path from filePaths if the button is invalid to show the correct count of successfully loaded buttons
        filePaths.splice(filePaths.indexOf(filePath), 1);
        logger.warn(t('system.button.invalid', { file: filePath }));

        tableData.push({ file: filePath.split('/').slice(-2).join('/'), customId: button?.options?.customId ?? '?', valid: false });
      }
    }),
  );

  const endTime = performance.now();
  const duration = endTime - startTime;

  return { files: filePaths, tableData, duration, count: client.buttons.size };
}

/**
 * Checks if the provided object is a valid button.
 *
 * @param button - The object to check.
 * @returns True if the object is a valid button, false otherwise.
 */
export function isValidButton(button: Button): button is Button {
  return (
    typeof button === 'object' &&
    button !== null &&
    typeof button.options === 'object' &&
    button.options !== null &&
    'customId' in button.options &&
    'execute' in button.options
  );
}
