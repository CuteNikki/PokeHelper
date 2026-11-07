import { ApplicationIntegrationType, InteractionContextType, PermissionFlagsBits, SlashCommandBuilder } from 'discord.js';

import { Command } from 'classes/base/command';

import { DAY, HOUR } from 'utility/duration';
import { getTranslate } from 'utility/i18next';
import { userSubject } from 'utility/logs/format';
import { isBanned, MAX_REASON_LENGTH, moderationProblem, parseModerationDuration, runModeration } from 'utility/moderation/run';
import { sendError } from 'utility/response';

/** The longest temporary ban, in days, which is 5 years. Longer ones can just as well be lifted by hand. */
const MAX_BAN_DAYS = 5 * 365;

/** A ban, for good or for a while, which also works on people who aren't on the server, like by pasting their ID. */
export default new Command({
  data: new SlashCommandBuilder()
    .setContexts(InteractionContextType.Guild)
    .setIntegrationTypes(ApplicationIntegrationType.GuildInstall)
    .setDefaultMemberPermissions(PermissionFlagsBits.BanMembers)
    .setName('ban')
    .setDescription("Ban someone from the server, also if they're not on it")
    .addUserOption((option) => option.setName('user').setDescription('Who to ban. Paste their ID if they are not on the server').setRequired(true))
    .addStringOption((option) => option.setName('reason').setDescription('Why they get banned').setMaxLength(MAX_REASON_LENGTH))
    .addStringOption((option) =>
      option.setName('duration').setDescription('How long, like 3d or 2w, after which it is lifted. Defaults to for good').setMaxLength(50),
    )
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

    const duration = interaction.options.getString('duration');
    const expiresAt = duration ? parseModerationDuration(duration, MAX_BAN_DAYS) : null;
    if (expiresAt === 'invalid') return sendError(interaction, t('moderation.problems.duration'));
    if (expiresAt === 'tooLong') return sendError(interaction, t('moderation.problems.banTooLong'));

    const deleteMessageSeconds = interaction.options.getInteger('delete-messages') ?? 0;
    return runModeration(interaction, {
      type: 'ban',
      user,
      expiresAt,
      reason: interaction.options.getString('reason'),
      dm: interaction.options.getBoolean('dm') ?? true,
      check: async () => ((await isBanned(interaction.guild, user.id)) ? t('moderation.problems.alreadyBanned', { user: userSubject(user) }) : null),
      act: (reason) => interaction.guild.members.ban(user.id, { reason, deleteMessageSeconds }),
    });
  },
});
