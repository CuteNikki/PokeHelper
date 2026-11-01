import { Routes, type ApplicationCommandType, type REST, type RESTPostAPIApplicationCommandsJSONBody } from 'discord.js';

import type { Command } from 'classes/base/command';

export interface RegistrationResult {
  /** How many commands were registered globally. */
  global: number;
  /** How many developer commands were registered in the developer server, or null if no developer server is set. */
  dev: number | null;
}

/**
 * Register commands with Discord, replacing the ones registered before.
 * Developer commands only go to the developer server, so nobody else sees them, and are skipped without one.
 * @param rest A REST client with the bot's token.
 * @param applicationId The bot's application ID.
 * @param commands The commands to register.
 * @param devGuildId The developer server's ID, from DEV_GUILD_ID.
 */
export async function registerCommands(
  rest: REST,
  applicationId: string,
  commands: Command<ApplicationCommandType>[],
  devGuildId?: string,
): Promise<RegistrationResult> {
  const toJSON = (command: Command<ApplicationCommandType>) => command.options.data.toJSON() as RESTPostAPIApplicationCommandsJSONBody;
  const globalCommands = commands.filter((command) => !command.options.devOnly).map(toJSON);
  const devCommands = commands.filter((command) => command.options.devOnly).map(toJSON);

  await rest.put(Routes.applicationCommands(applicationId), { body: globalCommands });
  if (devGuildId) await rest.put(Routes.applicationGuildCommands(applicationId, devGuildId), { body: devCommands });

  return { global: globalCommands.length, dev: devGuildId ? devCommands.length : null };
}
