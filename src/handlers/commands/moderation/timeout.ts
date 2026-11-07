import { ApplicationIntegrationType, InteractionContextType, PermissionFlagsBits, SlashCommandBuilder } from 'discord.js';

import { Command } from 'classes/base/command';

import { getTranslate } from 'utility/i18next';
import { MAX_REASON_LENGTH, MAX_TIMEOUT_DAYS, moderationProblem, parseModerationDuration, runModeration } from 'utility/moderation/run';
import { sendError } from 'utility/response';

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
    const t = getTranslate(interaction.locale);
    const user = interaction.options.getUser('member', true);
    const member = interaction.options.getMember('member');
    if (!member) return sendError(interaction, t('moderation.problems.notMember'));
    const problem = moderationProblem(interaction.guild, interaction.member, user, member, 'timeout', t);
    if (problem) return sendError(interaction, problem);

    const expiresAt = parseModerationDuration(interaction.options.getString('duration', true), MAX_TIMEOUT_DAYS);
    if (expiresAt === 'invalid') return sendError(interaction, t('moderation.problems.duration'));
    if (expiresAt === 'tooLong') return sendError(interaction, t('moderation.problems.timeoutTooLong', { max: MAX_TIMEOUT_DAYS }));

    return runModeration(interaction, {
      type: 'timeout',
      user,
      reason: interaction.options.getString('reason'),
      expiresAt,
      dm: interaction.options.getBoolean('dm') ?? true,
      act: (reason) => member.disableCommunicationUntil(expiresAt, reason),
    });
  },
});
