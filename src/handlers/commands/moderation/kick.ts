import { ApplicationIntegrationType, InteractionContextType, PermissionFlagsBits, SlashCommandBuilder } from 'discord.js';

import { Command } from 'classes/base/command';

import { getTranslate } from 'utility/i18next';
import { MAX_REASON_LENGTH, moderationProblem, runModeration } from 'utility/moderation/run';
import { sendError } from 'utility/response';

/** A kick, after which the member can join again with an invite. */
export default new Command({
  data: new SlashCommandBuilder()
    .setContexts(InteractionContextType.Guild)
    .setIntegrationTypes(ApplicationIntegrationType.GuildInstall)
    .setDefaultMemberPermissions(PermissionFlagsBits.KickMembers)
    .setName('kick')
    .setDescription('Kick a member from the server. They can join again with an invite')
    .addUserOption((option) => option.setName('member').setDescription('Who to kick').setRequired(true))
    .addStringOption((option) => option.setName('reason').setDescription('Why they get kicked').setMaxLength(MAX_REASON_LENGTH))
    .addBooleanOption((option) => option.setName('dm').setDescription('Whether to tell them by DM. Defaults to yes')),

  async execute(interaction) {
    if (!interaction.inCachedGuild()) return;
    const t = getTranslate(interaction.locale);
    const user = interaction.options.getUser('member', true);
    const member = interaction.options.getMember('member');
    if (!member) return sendError(interaction, t('moderation.problems.notMember'));
    const problem = moderationProblem(interaction.guild, interaction.member, user, member, 'kick', t);
    if (problem) return sendError(interaction, problem);

    return runModeration(interaction, {
      type: 'kick',
      user,
      reason: interaction.options.getString('reason'),
      dm: interaction.options.getBoolean('dm') ?? true,
      act: (reason) => member.kick(reason),
    });
  },
});
