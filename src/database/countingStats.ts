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
 */
export const getRecentRuns = async (guildId: string, take: number) => {
  const [runs, total] = await Promise.all([
    prisma.countingRun.findMany({ where: { guildId }, orderBy: { id: 'desc' }, take }),
    prisma.countingRun.count({ where: { guildId } }),
  ]);
  return runs.map((run, index) => ({ ...run, runNumber: total - index }));
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
 */
export const getTopCounters = async (guildId: string, take: number) =>
  prisma.countingUser.findMany({
    where: { guildId, counted: { gt: 0 } },
    orderBy: [{ counted: 'desc' }, { mistakes: 'asc' }],
    take,
  });

/**
 * Get a member's counting stats in a guild, with their rank by how much they counted.
 * @param guildId {string} The ID of the guild.
 * @param userId {string} The ID of the member.
 */
export const getCountingUser = async (guildId: string, userId: string) => {
  const user = await prisma.countingUser.findUnique({ where: { guildId_userId: { guildId, userId } } });
  if (!user) return null;

  const ahead = await prisma.countingUser.count({ where: { guildId, counted: { gt: user.counted } } });
  return { ...user, rank: ahead + 1 };
};

/**
 * Get how many runs a guild's counting game had, including the ongoing one.
 * @param guildId {string} The ID of the guild.
 */
export const getRunCount = async (guildId: string) => prisma.countingRun.count({ where: { guildId } });
