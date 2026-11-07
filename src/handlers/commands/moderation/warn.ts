import { ApplicationIntegrationType, InteractionContextType, PermissionFlagsBits, SlashCommandBuilder } from 'discord.js';

import { Command } from 'classes/base/command';

import { getTranslate } from 'utility/i18next';
import { MAX_REASON_LENGTH, moderationProblem, runModeration } from 'utility/moderation/run';
import { sendError } from 'utility/response';

/** A warning, which only does something as a case in someone's history, and as a DM telling them. */
export default new Command({
  data: new SlashCommandBuilder()
    .setContexts(InteractionContextType.Guild)
    .setIntegrationTypes(ApplicationIntegrationType.GuildInstall)
    .setDefaultMemberPermissions(PermissionFlagsBits.ModerateMembers)
    .setName('warn')
    .setDescription('Warn a member, which goes in their case history')
    .addUserOption((option) => option.setName('member').setDescription('Who to warn').setRequired(true))
    .addStringOption((option) => option.setName('reason').setDescription('Why they get warned').setRequired(true).setMaxLength(MAX_REASON_LENGTH))
    .addBooleanOption((option) => option.setName('dm').setDescription('Whether to tell them by DM. Defaults to yes')),

  async execute(interaction) {
    if (!interaction.inCachedGuild()) return;
    const t = getTranslate(interaction.locale);
    const user = interaction.options.getUser('member', true);
    const member = interaction.options.getMember('member');
    if (!member) return sendError(interaction, t('moderation.problems.notMember'));
    const problem = moderationProblem(interaction.guild, interaction.member, user, member, 'warn', t);
    if (problem) return sendError(interaction, problem);

    return runModeration(interaction, {
      type: 'warn',
      user,
      reason: interaction.options.getString('reason', true),
      dm: interaction.options.getBoolean('dm') ?? true,
      act: () => Promise.resolve(),
    });
  },
});
