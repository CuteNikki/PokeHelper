import { ApplicationIntegrationType, InteractionContextType, SlashCommandBuilder } from 'discord.js';

import { Command } from 'classes/base/command';

import { buildHelp, HELP_OVERVIEW } from 'utility/help';
import { getTranslate } from 'utility/i18next';
import { logger } from 'utility/logger';
import { sendError, sendResponse } from 'utility/response';

export default new Command({
  data: new SlashCommandBuilder()
    .setContexts(InteractionContextType.Guild, InteractionContextType.BotDM, InteractionContextType.PrivateChannel)
    .setIntegrationTypes(ApplicationIntegrationType.GuildInstall, ApplicationIntegrationType.UserInstall)
    .setName('help')
    .setDescription('All the commands you can use here'),

  async execute(interaction) {
    const t = getTranslate(interaction.locale);
    const help = await buildHelp(interaction, HELP_OVERVIEW, t).catch((error: unknown) => {
      logger.error(error, 'Failed to fetch the registered commands for /help');
      return null;
    });
    if (!help) return sendError(interaction, t('help.unavailable'));
    return sendResponse(interaction, help, { ephemeral: true });
  },
});
