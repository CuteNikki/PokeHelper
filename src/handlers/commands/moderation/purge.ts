import {
  ApplicationIntegrationType,
  InteractionContextType,
  MessageFlags,
  PermissionFlagsBits,
  type PermissionsString,
  SlashCommandBuilder,
  subtext,
} from 'discord.js';

import { Command } from 'classes/base/command';

import { fetchChannel, formatPermissions } from 'utility/discord';
import { DAY } from 'utility/duration';
import { getTranslate } from 'utility/i18next';
import { userSubject } from 'utility/logs/format';
import { createResponse, sendError, sendResponse } from 'utility/response';

/** The most messages Discord deletes at once, and looks through for someone's. */
const MAX_MESSAGES = 100;
/** Discord only deletes messages younger than this at once. */
const MAX_AGE = 14 * DAY;
/** What the bot needs in the channel to find and delete the messages. */
const NEEDED: PermissionsString[] = ['ViewChannel', 'ReadMessageHistory', 'ManageMessages'];

/** Delete the latest messages of a channel at once, or only someone's among them. Not a case, as it isn't about one member. */
export default new Command({
  data: new SlashCommandBuilder()
    .setContexts(InteractionContextType.Guild)
    .setIntegrationTypes(ApplicationIntegrationType.GuildInstall)
    .setDefaultMemberPermissions(PermissionFlagsBits.ManageMessages)
    .setName('purge')
    .setDescription('Delete the latest messages in this channel, or only those of someone')
    .addIntegerOption((option) =>
      option.setName('amount').setDescription(`How many, at most ${MAX_MESSAGES}`).setRequired(true).setMinValue(1).setMaxValue(MAX_MESSAGES),
    )
    .addUserOption((option) => option.setName('user').setDescription(`Only their messages, among the latest ${MAX_MESSAGES}`)),

  async execute(interaction) {
    if (!interaction.inCachedGuild()) return;
    const t = getTranslate(interaction.locale);
    // Also when the server shows the command to others in its settings, as they couldn't delete others' messages themselves
    if (!interaction.memberPermissions.has('ManageMessages')) {
      return sendError(interaction, t('moderation.panel.noPermission', { permission: t('permission.ManageMessages') }));
    }

    // Answered first, as fetching and deleting can take a moment
    await interaction.deferReply({ flags: [MessageFlags.Ephemeral] });
    // Asked of Discord when it isn't known, like a thread nobody wrote in since the bot started. Only fails when the bot can't see it
    const fetchedChannel = interaction.channel ?? (await fetchChannel(interaction.client, interaction.channelId));
    const channel = fetchedChannel?.isTextBased() && !fetchedChannel.isDMBased() ? fetchedChannel : null;
    const missing = channel && interaction.guild.members.me ? channel.permissionsFor(interaction.guild.members.me).missing(NEEDED) : NEEDED;
    if (!channel || missing.length > 0) {
      return sendError(interaction, t('moderation.purge.missing', { permissions: formatPermissions(missing, t) }));
    }
    const amount = interaction.options.getInteger('amount', true);
    const user = interaction.options.getUser('user');
    const fetched = await channel.messages.fetch({ limit: user ? MAX_MESSAGES : amount });
    const now = Date.now();
    const candidates = [...fetched.values()].filter((message) => !user || message.author.id === user.id);
    const recent = candidates.filter((message) => now - message.createdTimestamp < MAX_AGE && !message.pinned).slice(0, amount);
    if (recent.length === 0)
      return sendResponse(
        interaction,
        createResponse(t(user ? 'moderation.purge.noneOf' : 'moderation.purge.none', { user: user ? userSubject(user) : '' }), 'info'),
      );

    const deleted = await channel.bulkDelete(recent, true);
    const lines = [t(user ? 'moderation.purge.doneOf' : 'moderation.purge.done', { count: deleted.size, user: user ? userSubject(user) : '' })];
    // Older and pinned ones are left, which would otherwise look like it didn't work
    if (deleted.size < Math.min(amount, candidates.length)) lines.push(subtext(t('moderation.purge.skipped')));
    return sendResponse(interaction, { ...createResponse(lines.join('\n'), 'success'), allowedMentions: { parse: [] } });
  },
});
