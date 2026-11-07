import { ApplicationIntegrationType, type Guild, InteractionContextType, PermissionFlagsBits, SlashCommandBuilder } from 'discord.js';

import { Command } from 'classes/base/command';

import { DAY, HOUR } from 'utility/duration';
import { getTranslate } from 'utility/i18next';
import { userSubject } from 'utility/logs/format';
import { MAX_REASON_LENGTH, moderationProblem, runModeration } from 'utility/moderation/run';
import { sendError } from 'utility/response';

/** Whether someone is banned from a server. */
export const isBanned = async (guild: Guild, userId: string) => (await guild.bans.fetch({ user: userId, force: true }).catch(() => null)) !== null;

/** A ban, which also works on people who aren't on the server, like by pasting their ID. */
export default new Command({
  data: new SlashCommandBuilder()
    .setContexts(InteractionContextType.Guild)
    .setIntegrationTypes(ApplicationIntegrationType.GuildInstall)
    .setDefaultMemberPermissions(PermissionFlagsBits.BanMembers)
    .setName('ban')
    .setDescription("Ban someone from the server, also if they're not on it")
    .addUserOption((option) => option.setName('user').setDescription('Who to ban. Paste their ID if they are not on the server').setRequired(true))
    .addStringOption((option) => option.setName('reason').setDescription('Why they get banned').setMaxLength(MAX_REASON_LENGTH))
    .addIntegerOption((option) =>
      option
        .setName('delete-messages')
        .setDescription('Delete their messages from a while back. Defaults to none')
        .addChoices(
          { name: "Don't delete any", value: 0 },
          { name: 'From the last hour', value: HOUR / 1000 },
          { name: 'From the last day', value: DAY / 1000 },
          { name: 'From the last 7 days', value: (7 * DAY) / 1000 },
        ),
    )
    .addBooleanOption((option) => option.setName('dm').setDescription('Whether to tell them by DM. Defaults to yes')),

  async execute(interaction) {
    if (!interaction.inCachedGuild()) return;
    const t = getTranslate(interaction.locale);
    const user = interaction.options.getUser('user', true);
    const member = interaction.options.getMember('user');
    const problem = moderationProblem(interaction.guild, interaction.member, user, member, 'ban', t);
    if (problem) return sendError(interaction, problem);

    const deleteMessageSeconds = interaction.options.getInteger('delete-messages') ?? 0;
    return runModeration(interaction, {
      type: 'ban',
      user,
      reason: interaction.options.getString('reason'),
      dm: interaction.options.getBoolean('dm') ?? true,
      check: async () => ((await isBanned(interaction.guild, user.id)) ? t('moderation.problems.alreadyBanned', { user: userSubject(user) }) : null),
      act: (reason) => interaction.guild.members.ban(user.id, { reason, deleteMessageSeconds }),
    });
  },
});
