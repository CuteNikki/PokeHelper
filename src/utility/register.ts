import { REST, Routes, type ApplicationCommandDataResolvable } from 'discord.js';

import { getFilesFrom } from 'utility/files';
import { logger } from 'utility/logger';
import { isValidCommand } from '../loading/commands';

const DISCORD_TOKEN = process.env.DISCORD_TOKEN;
const DISCORD_ID = process.env.DISCORD_ID;

if (!DISCORD_TOKEN || !DISCORD_ID) {
  throw new Error('DISCORD_TOKEN or DISCORD_ID is not set in the environment variables.');
}

logger.info('Registering commands...');

const filePaths = await getFilesFrom('src/commands');

const commands: ApplicationCommandDataResolvable[] = [];

// Use Promise.all to load all command files concurrently
await Promise.all(
  filePaths.map(async (filePath) => {
    const command = (await import(`${filePath}?update=${Date.now()}`)).default;

    if (isValidCommand(command)) {
      // Add the command to the commands array for registration
      commands.push(command.options.data.toJSON() as ApplicationCommandDataResolvable);
    } else {
      logger.warn(`Invalid command found in file: ${filePath}. Skipping registration.`);
    }
  }),
);

logger.info(`Successfully loaded ${commands.length} commands from ${filePaths.length} files.`);

// Register the commands with the Discord API
try {
  const rest = new REST().setToken(DISCORD_TOKEN);

  await rest.put(Routes.applicationCommands(DISCORD_ID), { body: commands });
  logger.info(`Successfully registered ${commands.length} commands.`);
} catch (error) {
  logger.error(error, 'Failed to register commands:');
}
