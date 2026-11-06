import { prisma } from 'database/index';

/**
 * Get the ongoing run of a guild's counting game.
 * @param guildId {string} The ID of the guild.
 */
export const getCurrentRun = async (guildId: string) =>
  prisma.countingRun.findFirst({
    where: { guildId, endedAt: null },
    orderBy: { id: 'desc' },
  });

/**
 * Get a run's position among the guild's runs, starting at 1, so runs can be shown as #1, #2 and so on.
 * @param guildId {string} The ID of the guild.
 * @param runId {number} The ID of the run.
 */
export const getRunNumber = async (guildId: string, runId: number) =>
  prisma.countingRun.count({
    where: { guildId, id: { lte: runId } },
  });

/**
 * Get the most recent runs of a guild, newest first, with their position among all runs.
 * @param guildId {string} The ID of the guild.
 * @param take {number} How many runs to get.
 * @param skip {number} How many of the newest to skip, for later pages.
 * @returns The runs, with their number counted from the first, and how many runs there are.
 */
export const getRecentRuns = async (guildId: string, take: number, skip = 0) => {
  const [runs, total] = await Promise.all([
    prisma.countingRun.findMany({ where: { guildId }, orderBy: { id: 'desc' }, take, skip }),
    prisma.countingRun.count({ where: { guildId } }),
  ]);
  return { runs: runs.map((run, index) => ({ ...run, runNumber: total - skip - index })), total };
};

/**
 * Get when each of the given numbers was counted in a run.
 * @param runId {number} The ID of the run.
 * @param numbers {number[]} The numbers to look up, like milestones.
 */
export const getEntriesForNumbers = async (runId: number, numbers: number[]) =>
  prisma.countingEntry.findMany({
    where: { runId, number: { in: numbers } },
    orderBy: { number: 'asc' },
  });

/**
 * Get the members who counted the most in a guild.
 * @param guildId {string} The ID of the guild.
 * @param take {number} How many members to get.
 * @param skip {number} How many of the top to skip, for later pages.
 * @returns The members, and how many counted at all.
 */
export const getTopCounters = async (guildId: string, take: number, skip = 0) => {
  const where = { guildId, counted: { gt: 0 } };
  const [counters, total] = await Promise.all([
    prisma.countingUser.findMany({ where, orderBy: [{ counted: 'desc' }, { mistakes: 'asc' }, { userId: 'asc' }], take, skip }),
    prisma.countingUser.count({ where }),
  ]);
  return { counters, total };
};

/** Where someone is on the counting leaderboard, in the order it's shown, or null when they haven't counted. */
export async function getCounterPosition(guildId: string, userId: string): Promise<number | null> {
  const own = await prisma.countingUser.findUnique({ where: { guildId_userId: { guildId, userId } } });
  if (!own || own.counted === 0) return null;
  const ahead = await prisma.countingUser.count({
    where: {
      guildId,
      counted: { gt: 0 },
      OR: [
        { counted: { gt: own.counted } },
        { counted: own.counted, mistakes: { lt: own.mistakes } },
        { counted: own.counted, mistakes: own.mistakes, userId: { lt: userId } },
      ],
    },
  });
  return ahead + 1;
}

/**
 * Get a member's counting stats in a guild, with their place on the leaderboard, ties broken the same way.
 * @param guildId {string} The ID of the guild.
 * @param userId {string} The ID of the member.
 * @returns The stats, with a rank of null when they haven't counted.
 */
export const getCountingUser = async (guildId: string, userId: string) => {
  const [user, rank] = await Promise.all([
    prisma.countingUser.findUnique({ where: { guildId_userId: { guildId, userId } } }),
    getCounterPosition(guildId, userId),
  ]);
  return user ? { ...user, rank } : null;
};

/**
 * Get how many runs a guild's counting game had, including the ongoing one.
 * @param guildId {string} The ID of the guild.
 */
export const getRunCount = async (guildId: string) => prisma.countingRun.count({ where: { guildId } });
