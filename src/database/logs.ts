import { getGuildOrCreate } from 'database/guild';
import { prisma } from 'database/index';

import type { GuildLogs } from 'generated/prisma/client';

export type { GuildLogs };

export const getGuildLogs = async (guildId: string) => prisma.guildLogs.findUnique({ where: { guildId } });

/** The server's log settings, made with everything turned on and no channels if there are none yet. */
export async function getOrCreateGuildLogs(guildId: string) {
  await getGuildOrCreate(guildId);
  return prisma.guildLogs.upsert({ where: { guildId }, update: {}, create: { guildId } });
}

export const updateGuildLogs = async (guildId: string, data: Partial<Omit<GuildLogs, 'guildId' | 'createdAt' | 'updatedAt'>>) =>
  prisma.guildLogs.update({ where: { guildId }, data });

export const deleteGuildLogs = async (guildId: string) => prisma.guildLogs.deleteMany({ where: { guildId } });
