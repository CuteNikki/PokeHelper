import { ApplicationCommandType, ApplicationIntegrationType, ContextMenuCommandBuilder, InteractionContextType, MessageFlags } from 'discord.js';

import { Command } from 'classes/base/command';

import { getTranslate } from 'utility/i18next';
import { buildUserInfo } from 'utility/userInfo';

/**
 * Someone's user info from the menu of their name, shown only to who asked. Also where the bot isn't, like in DMs when someone installed it
 * for themselves, with only what Discord knows of the account there.
 */
export default new Command<ApplicationCommandType.User>({
  data: new ContextMenuCommandBuilder()
    .setType(ApplicationCommandType.User)
    .setContexts(InteractionContextType.Guild, InteractionContextType.BotDM, InteractionContextType.PrivateChannel)
    .setIntegrationTypes(ApplicationIntegrationType.GuildInstall, ApplicationIntegrationType.UserInstall)
    .setName('User info'),

  async execute(interaction) {
    const t = getTranslate(interaction.locale);
    // Answered first, as asking Discord for them can take a moment
    await interaction.deferReply({ flags: [MessageFlags.Ephemeral] });
    const server = interaction.inCachedGuild() ? { guild: interaction.guild, viewer: interaction.member } : null;
    return interaction.editReply(await buildUserInfo(interaction.client, interaction.targetId, server, t));
  },
});
