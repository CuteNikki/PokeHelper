import { ApplicationIntegrationType, InteractionContextType, SlashCommandBuilder } from 'discord.js';

import { Command } from 'classes/base/command';

import { showOwnPanel } from 'utility/tempVoice/controls';

export default new Command({
  data: new SlashCommandBuilder()
    .setContexts(InteractionContextType.Guild)
    .setIntegrationTypes(ApplicationIntegrationType.GuildInstall)
    .setName('voice')
    .setDescription("Change the voice channel of your own you're in"),

  async execute(interaction) {
    if (!interaction.inCachedGuild()) return;
    return showOwnPanel(interaction);
  },
});
