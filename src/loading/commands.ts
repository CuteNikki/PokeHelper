import { t } from 'i18next';

import { ExtendedClient } from 'classes/base/client';
import type { Command } from 'classes/base/command';

import { getFilesFrom } from 'utility/files';
import { logger } from 'utility/logger';

/** Load the commands in src/handlers/commands into the client. Cleared first, so reloading doesn't keep removed ones. */
export async function loadCommands(client: ExtendedClient) {
  client.commands.clear();

  const tableData: { file: string; name: string; valid: boolean }[] = [];
  const startTime = performance.now();

  const filePaths = await getFilesFrom('src/handlers/commands');

  await Promise.all(
    filePaths.map(async (filePath) => {
      const command = ((await import(`${filePath}?update=${Date.now()}`)) as { default: unknown }).default;

      if (isValidCommand(command)) {
        command.category = filePath.split('/').at(-2) ?? '';
        client.commands.set(command.options.data.name, command);

        tableData.push({ file: filePath.split('/').slice(-2).join('/'), name: command.options.data?.name ?? '?', valid: true });
      } else {
        // So the files counted are only the ones loaded
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

/** Whether a file's default export is a command. */
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
