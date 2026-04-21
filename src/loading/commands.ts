import { t } from 'i18next';

import { ExtendedClient } from 'classes/base/client';
import type { Command } from 'classes/base/command';

import { getFilesFrom } from 'utility/files';
import { logger } from 'utility/logger';

/**
 * Loads commands into the client.
 *
 * @param client - The ExtendedClient instance to load commands into.
 */
export async function loadCommands(client: ExtendedClient) {
  // Clear the existing commands collection to avoid duplicates when reloading
  // This is useful during development when commands are frequently updated
  client.commands.clear();

  const tableData: { file: string; name: string; valid: boolean }[] = [];
  const startTime = performance.now();

  const filePaths = await getFilesFrom('src/commands');

  // Use Promise.all to load all command files concurrently
  await Promise.all(
    filePaths.map(async (filePath) => {
      const command = ((await import(`${filePath}?update=${Date.now()}`)) as { default: unknown }).default;

      if (isValidCommand(command)) {
        // Add the command to the commands collection of the client
        client.commands.set(command.options.data.name, command);

        tableData.push({ file: filePath.split('/').slice(-2).join('/'), name: command.options.data?.name ?? '?', valid: true });
      } else {
        // Remove the path from filePaths if the command is invalid to show the correct count of successfully loaded commands
        filePaths.splice(filePaths.indexOf(filePath), 1);
        logger.warn(t('system.command.invalid', { file: filePath }));

        tableData.push({ file: filePath.split('/').slice(-2).join('/'), name: '?', valid: false });
      }
    }),
  );

  const endTime = performance.now();
  const duration = endTime - startTime;

  return { files: filePaths, tableData, duration, count: client.commands.size };
}

/**
 * Checks if the provided object is a valid command.
 *
 * @param command - The object to check.
 * @returns True if the object is a valid command, false otherwise.
 */
export function isValidCommand(command: unknown): command is Command {
  return (
    typeof command === 'object' &&
    command !== null &&
    typeof (command as Command).options === 'object' &&
    (command as Command).options !== null &&
    'data' in (command as Command).options &&
    'execute' in (command as Command).options
  );
}
