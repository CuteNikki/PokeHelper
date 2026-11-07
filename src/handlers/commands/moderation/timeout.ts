import { ApplicationIntegrationType, InteractionContextType, PermissionFlagsBits, SlashCommandBuilder } from 'discord.js';

import { Command } from 'classes/base/command';

import { MAX_REASON_LENGTH, MAX_TIMEOUT_DAYS, runModeration } from 'utility/moderation/run';

/** A timeout, during which the member can't chat, talk or react, and which Discord ends by itself. */
export default new Command({
  data: new SlashCommandBuilder()
    .setContexts(InteractionContextType.Guild)
    .setIntegrationTypes(ApplicationIntegrationType.GuildInstall)
    .setDefaultMemberPermissions(PermissionFlagsBits.ModerateMembers)
    .setName('timeout')
    .setDescription("Time out a member, so they can't chat or talk for a while")
    .addUserOption((option) => option.setName('member').setDescription('Who to time out').setRequired(true))
    .addStringOption((option) =>
      option.setName('duration').setDescription(`How long, like 10m, 2h or 3d. At most ${MAX_TIMEOUT_DAYS} days`).setRequired(true).setMaxLength(50),
    )
    .addStringOption((option) => option.setName('reason').setDescription('Why they get timed out').setMaxLength(MAX_REASON_LENGTH))
    .addBooleanOption((option) => option.setName('dm').setDescription('Whether to tell them by DM. Defaults to yes')),

  async execute(interaction) {
    if (!interaction.inCachedGuild()) return;
    return runModeration(interaction, {
      type: 'timeout',
      user: interaction.options.getUser('member', true),
      member: interaction.options.getMember('member'),
      reason: interaction.options.getString('reason'),
      duration: interaction.options.getString('duration', true),
      dm: interaction.options.getBoolean('dm') ?? true,
    });
  },
});
