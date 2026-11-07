import { ApplicationIntegrationType, InteractionContextType, PermissionFlagsBits, SlashCommandBuilder } from 'discord.js';

import { Command } from 'classes/base/command';

import { getTranslate } from 'utility/i18next';
import { userSubject } from 'utility/logs/format';
import { MAX_REASON_LENGTH, moderationProblem, runModeration } from 'utility/moderation/run';
import { sendError } from 'utility/response';

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
    const t = getTranslate(interaction.locale);
    const user = interaction.options.getUser('member', true);
    const member = interaction.options.getMember('member');
    if (!member) return sendError(interaction, t('moderation.problems.notMember'));
    if (!member.isCommunicationDisabled()) return sendError(interaction, t('moderation.problems.notTimedOut', { user: userSubject(user) }));
    const problem = moderationProblem(interaction.guild, interaction.member, user, member, 'untimeout', t);
    if (problem) return sendError(interaction, problem);

    return runModeration(interaction, {
      type: 'untimeout',
      user,
      reason: interaction.options.getString('reason'),
      dm: interaction.options.getBoolean('dm') ?? true,
      act: (reason) => member.timeout(null, reason),
    });
  },
});
