import { ApplicationIntegrationType, InteractionContextType, SlashCommandBuilder } from 'discord.js';

import { Command } from 'classes/base/command';

import { getTranslate } from 'utility/i18next';
import { buildPrivacyPanel } from 'utility/privacy';
import { sendResponse } from 'utility/response';
import { settingsContext } from 'utility/settings';

export default new Command({
  data: new SlashCommandBuilder()
    .setContexts(InteractionContextType.Guild, InteractionContextType.BotDM, InteractionContextType.PrivateChannel)
    .setIntegrationTypes(ApplicationIntegrationType.GuildInstall, ApplicationIntegrationType.UserInstall)
    .setName('privacy')
    .setDescription('Download or delete the data stored about you, or about this server'),

  async execute(interaction) {
    const t = getTranslate(interaction.locale);
    return sendResponse(interaction, buildPrivacyPanel(settingsContext(interaction), t), { ephemeral: true });
  },
});
