import { ApplicationIntegrationType, InteractionContextType, PermissionFlagsBits, SlashCommandBuilder } from 'discord.js';

import { Command } from 'classes/base/command';

import { getTranslate } from 'utility/i18next';
import { userSubject } from 'utility/logs/format';
import { isBanned, MAX_REASON_LENGTH, moderationProblem, runModeration } from 'utility/moderation/run';
import { sendError } from 'utility/response';

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
    const t = getTranslate(interaction.locale);
    const user = interaction.options.getUser('user', true);
    const problem = moderationProblem(interaction.guild, interaction.member, user, null, 'unban', t);
    if (problem) return sendError(interaction, problem);

    return runModeration(interaction, {
      type: 'unban',
      user,
      reason: interaction.options.getString('reason'),
      dm: false,
      check: async () => ((await isBanned(interaction.guild, user.id)) ? null : t('moderation.problems.notBanned', { user: userSubject(user) })),
      act: (reason) => interaction.guild.members.unban(user.id, reason),
    });
  },
});
