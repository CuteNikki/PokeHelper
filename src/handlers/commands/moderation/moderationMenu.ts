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
import { renderModerationPanel } from 'utility/moderation/panel';

/**
 * Everything moderation does to someone, from the menu of their name, shown only to who asked: their cases, and warning, timing out,
 * kicking and banning them. One menu for all of it, as Discord only allows an app 5 menus on names.
 */
export default new Command<ApplicationCommandType.User>({
  data: new ContextMenuCommandBuilder()
    .setType(ApplicationCommandType.User)
    .setContexts(InteractionContextType.Guild)
    .setIntegrationTypes(ApplicationIntegrationType.GuildInstall)
    .setDefaultMemberPermissions(PermissionFlagsBits.ModerateMembers)
    .setName('Moderation'),

  async execute(interaction) {
    if (!interaction.inCachedGuild()) return;
    await interaction.deferReply({ flags: [MessageFlags.Ephemeral] });
    return interaction.editReply(
      await renderModerationPanel(interaction.guild, interaction.targetUser.id, interaction.member, getTranslate(interaction.locale)),
    );
  },
});
