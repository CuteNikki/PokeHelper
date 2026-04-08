import { ExtendedClient } from 'classes/base/client';
import type { Command } from 'classes/base/command';

import { getFilesFrom } from 'utility/files';

/**
 * Loads commands into the client.
 *
 * @param client - The ExtendedClient instance to load commands into.
 */
export async function loadCommands(client: ExtendedClient) {
  // Clear the existing commands collection to avoid duplicates when reloading
  // This is useful during development when commands are frequently updated
  client.commands.clear();

  const filePaths = await getFilesFrom('src/commands');

  // Use Promise.all to load all command files concurrently
  await Promise.all(
    filePaths.map(async (filePath) => {
      const command = (await import(`${filePath}?update=${Date.now()}`)).default;

      if (isValidCommand(command)) {
        // Add the command to the commands collection of the client
        client.commands.set(command.options.data.name, command);
      } else {
        // Remove the path from filePaths if the command is invalid to show the correct count of successfully loaded commands
        filePaths.splice(filePaths.indexOf(filePath), 1);
        console.warn(`Invalid command found in file: ${filePath}. Skipping registration.`);
      }
    }),
  );
}

/**
 * Checks if the provided object is a valid command.
 *
 * @param command - The object to check.
 * @returns True if the object is a valid command, false otherwise.
 */
export function isValidCommand(command: Command): command is Command {
  return (
    typeof command === 'object' &&
    command !== null &&
    typeof command.options === 'object' &&
    command.options !== null &&
    'data' in command.options &&
    'execute' in command.options
  );
}
