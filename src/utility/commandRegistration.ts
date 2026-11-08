import { Routes, type ApplicationCommandType, type REST, type RESTPostAPIApplicationCommandsJSONBody } from 'discord.js';

import type { Command } from 'classes/base/command';

import { loadCommandTranslations, localizeCommand } from 'utility/commandLocalization';

export interface RegistrationResult {
  /** How many commands were registered globally. */
  global: number;
  /** How many developer commands were registered in the developer server, or null if no developer server is set. */
  dev: number | null;
}

/** Register commands with Discord, replacing the old ones. Developer commands only go to the developer server, and are skipped without one. */
export async function registerCommands(
  rest: REST,
  applicationId: string,
  commands: Command<ApplicationCommandType>[],
  devGuildId?: string,
): Promise<RegistrationResult> {
  const translations = loadCommandTranslations();
  const toJSON = (command: Command<ApplicationCommandType>) =>
    localizeCommand(command.options.data.toJSON() as RESTPostAPIApplicationCommandsJSONBody, translations);
  const globalCommands = commands.filter((command) => !command.options.devOnly).map(toJSON);
  const devCommands = commands.filter((command) => command.options.devOnly).map(toJSON);

  await rest.put(Routes.applicationCommands(applicationId), { body: globalCommands });
  if (devGuildId) await rest.put(Routes.applicationGuildCommands(applicationId, devGuildId), { body: devCommands });

  return { global: globalCommands.length, dev: devGuildId ? devCommands.length : null };
}
