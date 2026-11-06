import { prisma } from 'database/index';

/** Make sure a server has a row, which all its settings and data belong to. */
export async function ensureGuild(guildId: string): Promise<void> {
  await prisma.guild.upsert({ where: { guildId }, update: {}, create: { guildId } });
}

/**
 * Mark guilds the bot isn't in anymore as left, keeping the time they were first marked.
 * @param presentGuildIds {string[]} The IDs of the guilds the bot is in. Every other guild is marked.
 * @param at {Date} When the bot left, or noticed it.
 */
export const markOtherGuildsLeft = async (presentGuildIds: string[], at: Date) =>
  prisma.guild.updateMany({
    where: { guildId: { notIn: presentGuildIds }, leftAt: null },
    data: { leftAt: at },
  });

/**
 * Mark a guild as left, keeping the time it was first marked.
 * @param guildId {string} The ID of the guild the bot was removed from.
 * @param at {Date} When the bot left.
 */
export const markGuildLeft = async (guildId: string, at: Date) =>
  prisma.guild.updateMany({
    where: { guildId, leftAt: null },
    data: { leftAt: at },
  });

/**
 * Unmark guilds the bot is in again, so their data is kept.
 * @param guildIds {string[]} The IDs of the guilds the bot is in.
 */
export const clearGuildsLeft = async (guildIds: string[]) =>
  prisma.guild.updateMany({
    where: { guildId: { in: guildIds }, leftAt: { not: null } },
    data: { leftAt: null },
  });

/**
 * Delete the guilds the bot left before a time, with all their data.
 * @param cutoff {Date} Guilds left before this are deleted.
 */
export const deleteGuildsLeftBefore = async (cutoff: Date) =>
  prisma.guild.deleteMany({
    where: { leftAt: { lt: cutoff } },
  });
