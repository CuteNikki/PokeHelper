import { prisma } from 'database/index';

import type { GuildStarboard, StarboardEntry } from 'generated/prisma/client';

export type { GuildStarboard, StarboardEntry };

export const getGuildStarboard = async (guildId: string) => prisma.guildStarboard.findUnique({ where: { guildId } });

/** The server's starboard settings, made with no channel if there are none yet, so nothing is posted until one is picked. */
export async function getOrCreateGuildStarboard(guildId: string) {
  await prisma.guild.upsert({ where: { guildId }, update: {}, create: { guildId } });
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

export const deleteStarboardEntry = async (messageId: string) => prisma.starboardEntry.deleteMany({ where: { messageId } });
