import { ensureGuild } from 'database/guild';
import { prisma } from 'database/index';

import type { GuildStarboard, StarboardEntry } from 'generated/prisma/client';

export type { GuildStarboard, StarboardEntry };

export const getGuildStarboard = async (guildId: string) => prisma.guildStarboard.findUnique({ where: { guildId } });

/** The server's starboard settings, made with no channel if there are none yet, so nothing is posted until one is picked. */
export async function getOrCreateGuildStarboard(guildId: string) {
  await ensureGuild(guildId);
  return prisma.guildStarboard.upsert({ where: { guildId }, update: {}, create: { guildId } });
}

export const updateGuildStarboard = async (guildId: string, data: Partial<Omit<GuildStarboard, 'guildId' | 'createdAt' | 'updatedAt'>>) =>
  prisma.guildStarboard.update({ where: { guildId }, data });

/** Remove the settings. The posts stay on the starboard, but are forgotten, so they aren't updated anymore. */
export async function deleteGuildStarboard(guildId: string) {
  await prisma.$transaction([prisma.guildStarboard.deleteMany({ where: { guildId } }), prisma.starboardEntry.deleteMany({ where: { guildId } })]);
}

export const getStarboardEntry = async (messageId: string) => prisma.starboardEntry.findUnique({ where: { messageId } });

export const getStarboardEntryByPost = async (starboardMessageId: string) => prisma.starboardEntry.findUnique({ where: { starboardMessageId } });

export const saveStarboardEntry = async (entry: Pick<StarboardEntry, 'messageId' | 'guildId' | 'channelId' | 'authorId'> & Partial<StarboardEntry>) =>
  prisma.starboardEntry.upsert({ where: { messageId: entry.messageId }, create: entry, update: entry });

export const updateStarboardEntry = async (messageId: string, data: Partial<Omit<StarboardEntry, 'messageId' | 'createdAt' | 'updatedAt'>>) =>
  prisma.starboardEntry.update({ where: { messageId }, data });

/**
 * Forget messages starred before a time that never made it onto the starboard. Their reactions say who starred them, which is read
 * again if they get another star. Posts deleted by hand stay, so they aren't posted again.
 * @returns How many were forgotten.
 */
export const deleteUnpostedStarboardEntries = async (before: Date) =>
  prisma.$executeRaw`DELETE FROM "StarboardEntry" WHERE "starboardMessageId" IS NULL AND NOT "removed"
    AND ("messageId"::bigint >> 22) + 1420070400000 < ${BigInt(before.getTime())}`;

export const deleteStarboardEntry = async (messageId: string) => prisma.starboardEntry.deleteMany({ where: { messageId } });
