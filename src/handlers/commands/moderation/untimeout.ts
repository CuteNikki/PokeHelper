import { ApplicationIntegrationType, InteractionContextType, PermissionFlagsBits, SlashCommandBuilder } from 'discord.js';

import { Command } from 'classes/base/command';

import { MAX_REASON_LENGTH, runModeration } from 'utility/moderation/run';

/** Take a timeout away before it runs out, with why, which Discord's own way to do it doesn't ask for. */
export default new Command({
  data: new SlashCommandBuilder()
    .setContexts(InteractionContextType.Guild)
    .setIntegrationTypes(ApplicationIntegrationType.GuildInstall)
    .setDefaultMemberPermissions(PermissionFlagsBits.ModerateMembers)
    .setName('untimeout')
    .setDescription("Take a member's timeout away before it runs out")
    .addUserOption((option) => option.setName('member').setDescription('Whose timeout to take away').setRequired(true))
    .addStringOption((option) => option.setName('reason').setDescription('Why it gets taken away').setMaxLength(MAX_REASON_LENGTH))
    .addBooleanOption((option) => option.setName('dm').setDescription('Whether to tell them by DM. Defaults to yes')),

  async execute(interaction) {
    if (!interaction.inCachedGuild()) return;
    return runModeration(interaction, {
      type: 'untimeout',
      user: interaction.options.getUser('member', true),
      member: interaction.options.getMember('member'),
      reason: interaction.options.getString('reason'),
      dm: interaction.options.getBoolean('dm') ?? true,
    });
  },
});
