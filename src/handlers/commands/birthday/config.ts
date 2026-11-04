import { ApplicationIntegrationType, InteractionContextType, SlashCommandBuilder } from 'discord.js';

import { Command } from 'classes/base/command';

import { myBirthdaySettings } from 'settings/myBirthday';

import { getTranslate } from 'utility/i18next';
import { sendResponse } from 'utility/response';
import { settingsContext } from 'utility/settings';

export default new Command({
  data: new SlashCommandBuilder()
    .setContexts(InteractionContextType.Guild, InteractionContextType.BotDM, InteractionContextType.PrivateChannel)
    .setIntegrationTypes(ApplicationIntegrationType.GuildInstall, ApplicationIntegrationType.UserInstall)
    .setName('birthday')
    .setDescription('Set your birthday and where it gets announced'),

  async execute(interaction) {
    // Only you see your panel, so it's in your language
    const t = getTranslate(interaction.locale);
    return sendResponse(interaction, await myBirthdaySettings.render(settingsContext(interaction), t), { ephemeral: true });
  },
});
