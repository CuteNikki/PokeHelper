import {
  ApplicationCommandType,
  ApplicationIntegrationType,
  ContextMenuCommandBuilder,
  InteractionContextType,
  MessageFlags,
  PermissionFlagsBits,
} from 'discord.js';

import { Command } from 'classes/base/command';

import { getTranslate } from 'utility/i18next';
import { renderCasesFor } from 'utility/moderation/cases';

/** Someone's case history from the menu of their name, shown only to who asked. */
export default new Command<ApplicationCommandType.User>({
  data: new ContextMenuCommandBuilder()
    .setType(ApplicationCommandType.User)
    .setContexts(InteractionContextType.Guild)
    .setIntegrationTypes(ApplicationIntegrationType.GuildInstall)
    .setDefaultMemberPermissions(PermissionFlagsBits.ModerateMembers)
    .setName('Cases'),

  async execute(interaction) {
    if (!interaction.inCachedGuild()) return;
    await interaction.deferReply({ flags: [MessageFlags.Ephemeral] });
    return interaction.editReply(await renderCasesFor(interaction.guild, interaction.targetUser.id, getTranslate(interaction.locale)));
  },
});
