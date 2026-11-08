import { prisma } from 'database/index';

import type { ModCase, ModCaseType, Prisma } from 'generated/prisma/client';
import { DiscordLimits } from 'utility/discordLimits';

/** How a member's cases are listed: the newest or the oldest first, or by type, the newest first within each. */
export type CaseSort = 'newest' | 'oldest' | 'type';
export const CASE_SORTS: CaseSort[] = ['newest', 'oldest', 'type'];

/** Every type of case, in the order they're counted up in a member's summary and sorted by type. */
export const CASE_TYPES: ModCaseType[] = ['warn', 'timeout', 'untimeout', 'kick', 'ban', 'unban'];

/** What a new case says. Its number is the server's next one. */
export interface NewCase {
  guildId: string;
  type: ModCaseType;
  userId: string;
  moderatorId: string | null;
  reason: string | null;
  expiresAt?: Date | null;
}

/**
 * Cases still running, so a new one of the same kind or an unban can end them. A timeout that ran out is over, as Discord ends it, but a
 * ban that ran out is still on until the bot lifts it, which may not have happened yet, like while the bot was offline.
 */
const running = (type: ModCaseType, now: Date): Prisma.ModCaseWhereInput =>
  type === 'ban' ? { endedAt: null } : { endedAt: null, OR: [{ expiresAt: null }, { expiresAt: { gt: now } }] };

/**
 * The cases a new one ends: a ban ends the bans before it, so a temporary one isn't lifted under a new one, a timeout the timeouts
 * before it, as Discord replaces them, a timeout taken away the timeouts, and an unban the bans.
 */
const endedBy: Partial<Record<ModCaseType, ModCaseType>> = { ban: 'ban', timeout: 'timeout', untimeout: 'timeout', unban: 'ban' };

/**
 * Add a case with the server's next number, making sure the server is stored first. Ends the cases it replaces, see {@link endedBy}.
 */
export const createCase = (data: NewCase) =>
  prisma.$transaction(async (tx) => {
    // Counting up locks the server's row, so two cases at once can't get the same number
    const { caseCount } = await tx.guild.upsert({
      where: { guildId: data.guildId },
      update: { caseCount: { increment: 1 } },
      create: { guildId: data.guildId, caseCount: 1 },
      select: { caseCount: true },
    });
    const now = new Date();
    const ends = endedBy[data.type];
    if (ends) {
      await tx.modCase.updateMany({ where: { guildId: data.guildId, userId: data.userId, type: ends, ...running(ends, now) }, data: { endedAt: now } });
    }
    // Made at the same time as the ones it ends, so undoing it can tell them apart
    return tx.modCase.create({ data: { ...data, expiresAt: data.expiresAt ?? null, number: caseCount, createdAt: now } });
  });

/** Take a case back, like when Discord didn't let the bot do what it's about, and run the ones it ended again. */
export const undoCase = (modCase: ModCase) =>
  prisma.$transaction([
    prisma.modCase.deleteMany({ where: { id: modCase.id } }),
    prisma.modCase.updateMany({ where: { guildId: modCase.guildId, userId: modCase.userId, endedAt: modCase.createdAt }, data: { endedAt: null } }),
  ]);

/** A case of a server, or null if it was deleted meanwhile. */
export const getCase = (guildId: string, id: string) => prisma.modCase.findFirst({ where: { id, guildId } });

/** Delete a case. Returns whether it was still there. Its number isn't used again. */
export const deleteCase = async (guildId: string, id: string) => (await prisma.modCase.deleteMany({ where: { id, guildId } })).count > 0;

/** Change why a case happened, or take the reason away with null. Returns whether it was still there. */
export const setCaseReason = async (guildId: string, id: string, reason: string | null) =>
  (await prisma.modCase.updateMany({ where: { id, guildId }, data: { reason } })).count > 0;

const ORDER: Record<CaseSort, Prisma.ModCaseOrderByWithRelationInput[]> = {
  newest: [{ createdAt: 'desc' }],
  oldest: [{ createdAt: 'asc' }],
  // Enums sort in the order they're declared, which is the order of CASE_TYPES
  type: [{ type: 'asc' }, { createdAt: 'desc' }],
};

/**
 * A page of someone's cases on a server, how many they have, and how many of each type.
 * @param skip How many cases come before the page.
 */
export async function getUserCases(guildId: string, userId: string, sort: CaseSort, skip: number, take: number) {
  const where = { guildId, userId };
  const [cases, groups] = await Promise.all([
    prisma.modCase.findMany({ where, orderBy: ORDER[sort], skip, take }),
    prisma.modCase.groupBy({ by: ['type'], where, _count: { _all: true } }),
  ]);
  const counts = Object.fromEntries(CASE_TYPES.map((type) => [type, groups.find((group) => group.type === type)?._count._all ?? 0])) as Record<
    ModCaseType,
    number
  >;
  const total = Object.values(counts).reduce((sum, count) => sum + count, 0);
  return { cases, counts, total };
}

/** Temporary bans that ran out and haven't been lifted yet, the oldest first. */
export const getExpiredBans = (now: Date) =>
  prisma.modCase.findMany({ where: { type: 'ban', endedAt: null, expiresAt: { lte: now } }, orderBy: { expiresAt: 'asc' } });

/** A server's temporary bans that haven't been lifted yet, whether they ran out or not. */
export const getTempBans = (guildId: string) => prisma.modCase.findMany({ where: { guildId, type: 'ban', endedAt: null, expiresAt: { not: null } } });

/** Mark a case as ended, like a temporary ban once it's lifted. Returns whether it was still running, so only one can end it. */
export const endCase = async (id: string, now = new Date()) =>
  (await prisma.modCase.updateMany({ where: { id, endedAt: null }, data: { endedAt: now } })).count > 0;

/** Run a case again that was marked as ended at a time, like a temporary ban that couldn't be lifted after all. */
export const reopenCase = (id: string, endedAt: Date) => prisma.modCase.updateMany({ where: { id, endedAt }, data: { endedAt: null } });

/** Someone's newest case of a type made since a time, like the one a log is about, or null if there's none. */
export const getRecentCase = (guildId: string, userId: string, type: ModCaseType, since: Date) =>
  prisma.modCase.findFirst({ where: { guildId, userId, type, createdAt: { gte: since } }, orderBy: { createdAt: 'desc' } });

/** Change when a running timeout or ban ends, or make a ban one for good with null. Returns whether it was still running. */
export const setCaseEnd = async (guildId: string, id: string, expiresAt: Date | null) =>
  (await prisma.modCase.updateMany({ where: { id, guildId, endedAt: null }, data: { expiresAt } })).count > 0;

/**
 * The cases related to one: the case that ended it, and the cases it ended. A case that ends others is made at the very moment they end,
 * see {@link createCase}, which is how they're found, also for cases made before this was shown.
 */
export const getRelatedCases = (modCase: ModCase) =>
  prisma.modCase.findMany({
    where: {
      guildId: modCase.guildId,
      userId: modCase.userId,
      id: { not: modCase.id },
      OR: [{ endedAt: modCase.createdAt }, ...(modCase.endedAt ? [{ createdAt: modCase.endedAt }] : [])],
    },
    orderBy: { createdAt: 'asc' },
    take: DiscordLimits.buttonsPerRow,
  });
