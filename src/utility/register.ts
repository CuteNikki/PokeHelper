import { REST } from 'discord.js';

import type { Command } from 'classes/base/command';

import { registerCommands } from 'utility/commandRegistration';
import { getFilesFrom } from 'utility/files';
import { logger } from 'utility/logger';
import { isValidCommand } from '../loading/commands';

const DISCORD_TOKEN = process.env.DISCORD_TOKEN;
const DISCORD_ID = process.env.DISCORD_ID;
const DEV_GUILD_ID = process.env.DEV_GUILD_ID;

if (!DISCORD_TOKEN || !DISCORD_ID) {
  throw new Error('DISCORD_TOKEN or DISCORD_ID is not set in the environment variables.');
}

logger.info('Registering commands...');

const filePaths = await getFilesFrom('src/commands');

const commands: Command[] = [];

// Use Promise.all to load all command files concurrently
await Promise.all(
  filePaths.map(async (filePath) => {
    const command = ((await import(`${filePath}?update=${Date.now()}`)) as { default: unknown }).default;

    if (isValidCommand(command)) {
      commands.push(command);
    } else {
      logger.warn(`Invalid command found in file: ${filePath}. Skipping registration.`);
    }
  }),
);

logger.info(`Successfully loaded ${commands.length} commands from ${filePaths.length} files.`);

// Register the commands with the Discord API
try {
  const result = await registerCommands(new REST().setToken(DISCORD_TOKEN), DISCORD_ID, commands, DEV_GUILD_ID);
  logger.info(`Successfully registered ${result.global} commands.`);
  if (result.dev === null) {
    logger.warn('DEV_GUILD_ID is not set, so the developer commands were not registered.');
  } else {
    logger.info(`Successfully registered ${result.dev} developer commands in the developer server.`);
  }
} catch (error) {
  logger.error(error, 'Failed to register commands:');
}
