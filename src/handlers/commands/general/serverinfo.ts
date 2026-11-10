import { ApplicationIntegrationType, InteractionContextType, MessageFlags, SlashCommandBuilder } from 'discord.js';

import { Command } from 'classes/base/command';

import { getTranslate } from 'utility/i18next';
import { buildServerInfo } from 'utility/serverInfo';

/** This server at a glance, which only who asked sees. */
export default new Command({
  data: new SlashCommandBuilder()
    .setContexts(InteractionContextType.Guild)
    .setIntegrationTypes(ApplicationIntegrationType.GuildInstall)
    .setName('serverinfo')
    .setDescription("See this server's owner, members, boosts, channels, roles, emojis and which features it uses"),

  async execute(interaction) {
    if (!interaction.inCachedGuild()) return;
    const t = getTranslate(interaction.locale);
    // Answered first, as asking Discord for the owner and the database for the features can take a moment
    await interaction.deferReply({ flags: [MessageFlags.Ephemeral] });
    return interaction.editReply(await buildServerInfo(interaction.guild, t));
  },
});
