import { t } from 'i18next';

import type { ExtendedClient } from 'classes/base/client';
import type { SelectMenu } from 'classes/base/select';

import { getFilesFrom } from 'utility/files';
import { logger } from 'utility/logger';

/**
 * Loads select menus into the client.
 *
 * @param client - The ExtendedClient instance to load select menus into.
 */
export async function loadSelectMenus(client: ExtendedClient) {
  // Clear the existing select menus collection to avoid duplicates when reloading
  // This is useful during development when select menus are frequently updated
  client.selectMenus.clear();

  const tableData: { file: string; customId: string; valid: boolean }[] = [];
  const startTime = performance.now();

  const filePaths = await getFilesFrom('src/selects');

  // Use Promise.all to load all select menu files concurrently
  await Promise.all(
    filePaths.map(async (filePath) => {
      const selectMenu = ((await import(`${filePath}?update=${Date.now()}`)) as { default: unknown }).default;

      if (isValidSelectMenu(selectMenu)) {
        // Add the select menu to the selectMenus collection of the client
        client.selectMenus.set(selectMenu.options.customId, selectMenu);

        tableData.push({ file: filePath.split('/').slice(-2).join('/'), customId: selectMenu.options.customId, valid: true });
      } else {
        // Remove the path from filePaths if the select menu is invalid to show the correct count of successfully loaded select menus
        filePaths.splice(filePaths.indexOf(filePath), 1);
        logger.warn(t('system.selectMenu.invalid', { file: filePath }));

        tableData.push({ file: filePath.split('/').slice(-2).join('/'), customId: '?', valid: false });
      }
    }),
  );

  const endTime = performance.now();
  const duration = endTime - startTime;

  return { files: filePaths, tableData, duration, count: client.selectMenus.size };
}

/**
 * Checks if the provided object is a valid select menu.
 *
 * @param selectMenu - The object to check.
 * @returns True if the object is a valid select menu, false otherwise.
 */
export function isValidSelectMenu(selectMenu: unknown): selectMenu is SelectMenu {
  return (
    typeof selectMenu === 'object' &&
    selectMenu !== null &&
    typeof (selectMenu as SelectMenu).options === 'object' &&
    (selectMenu as SelectMenu).options !== null &&
    'customId' in (selectMenu as SelectMenu).options &&
    'execute' in (selectMenu as SelectMenu).options
  );
}
