import {
  ApplicationCommandType,
  ApplicationIntegrationType,
  ContextMenuCommandBuilder,
  InteractionContextType,
  MessageFlags,
  PermissionFlagsBits,
} from 'discord.js';

import { Command } from 'classes/base/command';

import { getGiveawayByMessage } from 'database/giveaways';

import { renderGiveawayPanel } from 'utility/giveaways/manage';
import { getTranslate } from 'utility/i18next';
import { createResponse } from 'utility/response';

/** A giveaway's panel straight from the menu of its post, shown only to who asked, without looking for it in the list. */
export default new Command<ApplicationCommandType.Message>({
  data: new ContextMenuCommandBuilder()
    .setType(ApplicationCommandType.Message)
    .setContexts(InteractionContextType.Guild)
    .setIntegrationTypes(ApplicationIntegrationType.GuildInstall)
    .setDefaultMemberPermissions(PermissionFlagsBits.ManageGuild)
    .setName('Manage giveaway'),

  async execute(interaction) {
    if (!interaction.inCachedGuild()) return;
    const t = getTranslate(interaction.locale);
    await interaction.deferReply({ flags: [MessageFlags.Ephemeral] });
    const giveaway = await getGiveawayByMessage(interaction.targetId);
    // Only a post of this server, as a message ID alone could be from anywhere
    if (giveaway?.guildId !== interaction.guildId) return interaction.editReply(createResponse(t('giveaway.manage.notAGiveaway'), 'error'));
    return interaction.editReply(await renderGiveawayPanel(interaction.guild, giveaway, t));
  },
});
