import { prisma } from 'database/index';

const LOG_CHANNELS = ['defaultChannelId', 'messagesChannelId', 'membersChannelId', 'moderationChannelId', 'serverChannelId', 'voiceChannelId'] as const;

/**
 * Forget a deleted channel in every setting of a guild that points at it, so the settings don't show a channel that's gone.
 * Where the setting has to have a channel, the feature is turned off instead, like counting, and role menus wait to be moved.
 * Starred messages from it are forgotten, but their posts stay on the starboard.
 */
export async function forgetDeletedChannel(guildId: string, channelId: string) {
  const [logs, starboard] = await Promise.all([
    prisma.guildLogs.findUnique({ where: { guildId }, select: { ignoredChannelIds: true } }),
    prisma.guildStarboard.findUnique({ where: { guildId }, select: { ignoredChannelIds: true } }),
  ]);

  await prisma.$transaction([
    prisma.guildLeveling.updateMany({ where: { guildId, levelUpChannelId: channelId }, data: { levelUpChannelId: null } }),
    prisma.guildLeveling.updateMany({ where: { guildId, winnersChannelId: channelId }, data: { winnersChannelId: null } }),
    prisma.levelingMultiplier.deleteMany({ where: { guildId, targetId: channelId, type: 'channel' } }),
    prisma.guildBirthday.updateMany({ where: { guildId, channelId }, data: { channelId: null } }),
    prisma.guildCounting.updateMany({ where: { guildId, channelId }, data: { enabled: false } }),
    // Moving the menu to another channel posts it there again
    prisma.reactionRoleMenu.updateMany({ where: { guildId, channelId }, data: { messageId: null } }),
    ...LOG_CHANNELS.map((field) => prisma.guildLogs.updateMany({ where: { guildId, [field]: channelId }, data: { [field]: null } })),
    ...(logs?.ignoredChannelIds.includes(channelId)
      ? [prisma.guildLogs.update({ where: { guildId }, data: { ignoredChannelIds: logs.ignoredChannelIds.filter((id) => id !== channelId) } })]
      : []),
    prisma.guildStarboard.updateMany({ where: { guildId, channelId }, data: { channelId: null } }),
    ...(starboard?.ignoredChannelIds.includes(channelId)
      ? [prisma.guildStarboard.update({ where: { guildId }, data: { ignoredChannelIds: starboard.ignoredChannelIds.filter((id) => id !== channelId) } })]
      : []),
    prisma.starboardEntry.deleteMany({ where: { guildId, channelId } }),
    // The posts are gone with it, and the messages can be posted again on the new starboard
    prisma.starboardEntry.updateMany({
      where: { guildId, starboardChannelId: channelId },
      data: { starboardMessageId: null, starboardChannelId: null, postImages: [] },
    }),
  ]);
}
