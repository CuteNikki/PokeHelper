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

/** Turn a log event on or off in the database itself, so two quick toggles can't undo each other by each writing the whole list. */
export async function setLogEventEnabled(guildId: string, event: string, on: boolean) {
  await getOrCreateGuildLogs(guildId);
  return on
    ? prisma.$executeRaw`UPDATE "GuildLogs" SET "disabledEvents" = array_remove("disabledEvents", ${event}), "updatedAt" = now() WHERE "guildId" = ${guildId}`
    : prisma.$executeRaw`UPDATE "GuildLogs" SET "disabledEvents" = array_append("disabledEvents", ${event}), "updatedAt" = now()
        WHERE "guildId" = ${guildId} AND NOT (${event} = ANY("disabledEvents"))`;
}

export const deleteGuildLogs = async (guildId: string) => prisma.guildLogs.deleteMany({ where: { guildId } });
