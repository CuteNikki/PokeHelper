import { prisma } from 'database/index';

import { RecentCache } from 'utility/cache';

/** Which servers have a row already, so a command doesn't wait for the database each time to make sure. */
const known = new RecentCache<void>(10_000);

/** Make sure a server has a row, which all its settings and data belong to. Only asks the database the first time. */
export const ensureGuild = (guildId: string): Promise<void> =>
  known.get(guildId, async () => {
    await prisma.guild.upsert({ where: { guildId }, update: {}, create: { guildId } });
  });

/** Forget that a server has a row, once it's deleted. */
export const forgetGuild = (guildId: string) => known.forget(guildId);

/**
 * Mark guilds the bot isn't in anymore as left, keeping the time they were first marked.
 * @param presentGuildIds The IDs of the guilds the bot is in. Every other guild is marked.
 * @param at When the bot left, or noticed it.
 */
export const markOtherGuildsLeft = async (presentGuildIds: string[], at: Date) =>
  prisma.guild.updateMany({
    where: { guildId: { notIn: presentGuildIds }, leftAt: null },
    data: { leftAt: at },
  });

/**
 * Mark a guild as left, keeping the time it was first marked.
 * @param at When the bot left.
 */
export const markGuildLeft = async (guildId: string, at: Date) =>
  prisma.guild.updateMany({
    where: { guildId, leftAt: null },
    data: { leftAt: at },
  });

/**
 * Unmark guilds the bot is in again, so their data is kept.
 * @param guildIds The IDs of the guilds the bot is in.
 */
export const clearGuildsLeft = async (guildIds: string[]) =>
  prisma.guild.updateMany({
    where: { guildId: { in: guildIds }, leftAt: { not: null } },
    data: { leftAt: null },
  });

/**
 * Delete the guilds the bot left before a time, with all their data.
 * @param cutoff Guilds left before this are deleted.
 */
export async function deleteGuildsLeftBefore(cutoff: Date) {
  const deleted = await prisma.guild.deleteMany({ where: { leftAt: { lt: cutoff } } });
  // Which ones isn't known, and it's rare, so all are checked again
  if (deleted.count > 0) known.clear();
  return deleted;
}
