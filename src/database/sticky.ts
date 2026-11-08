import { prisma } from 'database/index';

import { DiscordLimits } from 'utility/discordLimits';

/** The most sticky messages a server can have, as many as fit in its list. */
export const MAX_STICKIES = DiscordLimits.selectOptions;

/** The channels with a sticky message, in every server. */
export const getStickyChannelIds = async () => (await prisma.stickyMessage.findMany({ select: { channelId: true } })).map((sticky) => sticky.channelId);

export const getSticky = (channelId: string) => prisma.stickyMessage.findUnique({ where: { channelId } });

/** A server's sticky messages, the oldest first. */
export const getGuildStickies = (guildId: string) => prisma.stickyMessage.findMany({ where: { guildId }, orderBy: { createdAt: 'asc' } });

/** Set the sticky message of a channel, or change its text. Returns whether it's new or changed, or null if the server is at the limit. */
export const saveSticky = (guildId: string, channelId: string, text: string) =>
  prisma.$transaction(async (tx) => {
    // One at a time per server, so two at once can't both pass the count and go over the limit
    await tx.$executeRaw`SELECT pg_advisory_xact_lock(hashtext(${`stickies:${guildId}`}))`;
    const changed = (await tx.stickyMessage.updateMany({ where: { channelId }, data: { text } })).count > 0;
    if (changed) return { changed };
    if ((await tx.stickyMessage.count({ where: { guildId } })) >= MAX_STICKIES) return null;
    await tx.guild.upsert({ where: { guildId }, update: {}, create: { guildId } });
    await tx.stickyMessage.create({ data: { guildId, channelId, text } });
    return { changed };
  });

/**
 * Remember the bot's latest post of a sticky message, or that it has none, like while sticky messages are turned off.
 * Returns whether it's still there, as it may have been removed meanwhile.
 */
export const setStickyMessageId = async (channelId: string, messageId: string | null) =>
  (await prisma.stickyMessage.updateMany({ where: { channelId }, data: { messageId } })).count > 0;

/** Remove the sticky message of a channel. Returns it, for its post to be deleted, or null if there was none. */
export async function deleteSticky(channelId: string) {
  const sticky = await getSticky(channelId);
  if (!sticky) return null;
  await prisma.stickyMessage.deleteMany({ where: { channelId } });
  return sticky;
}
