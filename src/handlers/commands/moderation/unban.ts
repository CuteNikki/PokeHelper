import { ApplicationIntegrationType, InteractionContextType, PermissionFlagsBits, SlashCommandBuilder } from 'discord.js';

import { Command } from 'classes/base/command';

import { MAX_REASON_LENGTH, runModeration } from 'utility/moderation/run';

/**
 * Lift a ban, which ends a temporary one early. Nobody is told by DM, as someone banned rarely shares a server with the bot to get one.
 */
export default new Command({
  data: new SlashCommandBuilder()
    .setContexts(InteractionContextType.Guild)
    .setIntegrationTypes(ApplicationIntegrationType.GuildInstall)
    .setDefaultMemberPermissions(PermissionFlagsBits.BanMembers)
    .setName('unban')
    .setDescription('Lift a ban, so they can join again')
    .addUserOption((option) => option.setName('user').setDescription('Who to unban. Paste their ID to find them').setRequired(true))
    .addStringOption((option) => option.setName('reason').setDescription('Why they get unbanned').setMaxLength(MAX_REASON_LENGTH)),

  async execute(interaction) {
    if (!interaction.inCachedGuild()) return;
    return runModeration(interaction, {
      type: 'unban',
      user: interaction.options.getUser('user', true),
      member: null,
      reason: interaction.options.getString('reason'),
      dm: false,
    });
  },
});
