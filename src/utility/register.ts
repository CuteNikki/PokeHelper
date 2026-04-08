import { REST, Routes, type ApplicationCommandDataResolvable } from 'discord.js';

import { isValidCommand } from 'utility/commands';
import { getFilesFrom } from 'utility/files';

const DISCORD_TOKEN = process.env.DISCORD_TOKEN;
const DISCORD_ID = process.env.DISCORD_ID;

if (!DISCORD_TOKEN || !DISCORD_ID) {
  throw new Error('DISCORD_TOKEN or DISCORD_ID is not set in the environment variables.');
}

console.log('Registering commands...');

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
      console.warn(`Invalid command found in file: ${filePath}. Skipping registration.`);
    }
  }),
);

console.log(`Successfully loaded ${commands.length} commands from ${filePaths.length} files.`);

// Register the commands with the Discord API
try {
  const rest = new REST().setToken(DISCORD_TOKEN);

  await rest.put(Routes.applicationCommands(DISCORD_ID), { body: commands });
  console.log(`Successfully registered ${commands.length} commands.`);
} catch (error) {
  console.error('Failed to register commands:', error);
}
