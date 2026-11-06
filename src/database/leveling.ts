import { prisma } from 'database/index';

import type { GuildLeveling, MultiplierTarget } from 'generated/prisma/client';

export const getLevelFromXP = (xp: number) => Math.floor(0.1 * Math.sqrt(xp));
export const getXPForLevel = (level: number) => Math.pow(level / 0.1, 2);

export const getGuildLevelingConfiguration = async (guildId: string) =>
  prisma.guildLeveling.findUnique({
    where: { guildId },
    include: { rewards: true, multipliers: true },
  });

export const createGuildLevelingConfiguration = async (guildId: string) =>
  prisma.guildLeveling.create({
    data: { guildId },
    include: { rewards: true, multipliers: true },
  });

export const updateGuildLevelingConfiguration = async (guildId: string, query: Partial<Omit<GuildLeveling, 'guildId'>>) =>
  prisma.guildLeveling.upsert({
    where: { guildId },
    update: query,
    create: { guildId, ...query },
    include: { rewards: true, multipliers: true },
  });

// Rewards and multipliers go along through the database. Nothing to delete, like when reset twice, is fine
export const deleteGuildLevelingConfiguration = async (guildId: string) => prisma.guildLeveling.deleteMany({ where: { guildId } });

export const addIgnoredChannel = async (guildId: string, channelId: string) =>
  prisma.guildLeveling.upsert({
    where: { guildId },
    update: { ignoredChannels: { push: channelId } },
    create: { guildId, ignoredChannels: [channelId] },
  });

export const addIgnoredRole = async (guildId: string, roleId: string) =>
  prisma.guildLeveling.upsert({
    where: { guildId },
    update: { ignoredRoles: { push: roleId } },
    create: { guildId, ignoredRoles: [roleId] },
  });

export const addEnabledChannel = async (guildId: string, channelId: string) =>
  prisma.guildLeveling.upsert({
    where: { guildId },
    update: { enabledChannels: { push: channelId } },
    create: { guildId, enabledChannels: [channelId] },
  });

export const addEnabledRole = async (guildId: string, roleId: string) =>
  prisma.guildLeveling.upsert({
    where: { guildId },
    update: { enabledRoles: { push: roleId } },
    create: { guildId, enabledRoles: [roleId] },
  });

export const addGuildLevelingReward = async (guildId: string, level: number, roleId: string) =>
  prisma.guildLevelingReward.create({
    data: {
      guildId,
      level,
      roleId,
    },
  });

export const setWeeklyRewardRole = async (guildId: string, roleId: string) =>
  prisma.guildLeveling.upsert({
    where: { guildId },
    update: { weeklyReward: roleId },
    create: { guildId, weeklyReward: roleId },
    include: { rewards: true, multipliers: true },
  });

export const deleteGuildLevelingReward = async (id: string) =>
  prisma.guildLevelingReward.delete({
    where: { id },
  });

/** Which XP: all of it, or what was earned since the last weekly or monthly reset. */
export type LevelPeriod = 'allTime' | 'weekly' | 'monthly';
/** The periods that start over, each with a winner. */
export type ResetPeriod = Exclude<LevelPeriod, 'allTime'>;

/**
 * The table of a period's XP. The three have the same columns, so they're used through the all-time table's type,
 * as TypeScript can't call methods on a union of Prisma's tables.
 */
const levelTable = (period: LevelPeriod) =>
  (period === 'weekly' ? prisma.weeklyLevel : period === 'monthly' ? prisma.monthlyLevel : prisma.level) as unknown as typeof prisma.level;

/** Add XP to someone's all-time, weekly and monthly XP. Returns the all-time XP. */
export async function addXpToUser(guildId: string, userId: string, xpToAdd: number) {
  const upsert = (period: LevelPeriod) =>
    levelTable(period).upsert({
      where: { guildId_userId: { guildId, userId } },
      update: { xp: { increment: xpToAdd } },
      create: { guildId, userId, xp: xpToAdd },
    });
  const [allTime] = await Promise.all([upsert('allTime'), upsert('weekly'), upsert('monthly')]);
  return allTime;
}

export const getUserLevelingData = (guildId: string, userId: string, period: LevelPeriod = 'allTime') =>
  levelTable(period).findUnique({
    where: { guildId_userId: { guildId, userId } },
  });

export const getTopUsersByXP = (guildId: string, period: LevelPeriod, take: number = 10, skip: number = 0, sortOrder: 'asc' | 'desc' = 'desc') =>
  levelTable(period).findMany({
    where: { guildId },
    // Ties by user, so the order is the same on every page and someone can be found in it
    orderBy: [{ xp: sortOrder }, { userId: 'asc' }],
    take,
    skip,
  });

/** The rank of someone with this much XP in a period: 1 plus everyone with more. */
export const getUserRank = async (guildId: string, targetXp: number, period: LevelPeriod = 'allTime') =>
  (await levelTable(period).count({ where: { guildId, xp: { gt: targetXp } } })) + 1;

/** Where someone is on a period's leaderboard, in the order it's shown, or null when they aren't on it. */
export async function getLeaderboardPosition(guildId: string, userId: string, period: LevelPeriod, sortOrder: 'asc' | 'desc'): Promise<number | null> {
  const own = await getUserLevelingData(guildId, userId, period);
  if (!own) return null;
  const where = { guildId, OR: [{ xp: sortOrder === 'desc' ? { gt: own.xp } : { lt: own.xp } }, { xp: own.xp, userId: { lt: userId } }] };
  return (await levelTable(period).count({ where })) + 1;
}

export const getTotalUsersWithXP = (guildId: string, period: LevelPeriod = 'allTime') => levelTable(period).count({ where: { guildId } });

/**
 * Record a weekly or monthly reset and start the new period from zero.
 * @param winnerRole The role the winner got, or null if none was given.
 */
export const processResetTransaction = (guildId: string, period: ResetPeriod, newWinnerId: string | null, winnerRole: string | null) =>
  prisma.$transaction([
    prisma.guildLeveling.update({
      where: { guildId },
      data:
        period === 'weekly'
          ? { weeklyLastWinner: newWinnerId, weeklyWinnerRole: winnerRole, weeklyLastResetAt: new Date() }
          : { monthlyLastWinner: newWinnerId, monthlyWinnerRole: winnerRole, monthlyLastResetAt: new Date() },
    }),
    levelTable(period).deleteMany({ where: { guildId } }),
  ]);

export const getActiveLevelingConfigs = () =>
  prisma.guildLeveling.findMany({
    where: {
      enabled: true,
    },
  });
/**
 * Get a guild's leveling configuration, creating the default one, which has leveling turned off, if there's none yet.
 * @param guildId {string} The ID of the guild.
 */
export const getOrCreateGuildLevelingConfiguration = async (guildId: string) =>
  prisma.guildLeveling.upsert({
    where: { guildId },
    update: {},
    create: { guildId },
    include: { rewards: true, multipliers: true },
  });

/**
 * Set the multiplier of a channel, category or role, or remove it with null.
 * @param guildId {string} The ID of the guild.
 * @param targetId {string} The ID of the channel, category or role.
 * @param type {MultiplierTarget} Whether the target is a channel or a role.
 * @param multiplier {number | null} The multiplier, or null to remove it.
 */
export const setLevelingMultiplier = async (guildId: string, targetId: string, type: MultiplierTarget, multiplier: number | null) =>
  multiplier === null
    ? prisma.levelingMultiplier.deleteMany({ where: { guildId, targetId } })
    : prisma.levelingMultiplier.upsert({
        where: { guildId_targetId: { guildId, targetId } },
        update: { multiplier, type },
        create: { guildId, targetId, type, multiplier },
      });

/**
 * Set the level a reward role is given at, or remove the reward with null. A role is the reward for one level at most.
 * @param guildId {string} The ID of the guild.
 * @param roleId {string} The ID of the reward role.
 * @param level {number | null} The level, or null to remove the reward.
 */
export const setLevelingReward = async (guildId: string, roleId: string, level: number | null) =>
  prisma.$transaction(async (tx) => {
    await tx.guildLevelingReward.deleteMany({ where: { guildId, roleId } });
    if (level !== null) await tx.guildLevelingReward.create({ data: { guildId, roleId, level } });
  });

/**
 * Get the IDs of the members of a guild with at least some XP, like everyone who reached a level.
 * @param guildId {string} The ID of the guild.
 * @param minimumXp {number} The least XP to have.
 */
export const getUserIdsWithXp = async (guildId: string, minimumXp: number) =>
  (await prisma.level.findMany({ where: { guildId, xp: { gte: minimumXp } }, select: { userId: true } })).map((level) => level.userId);
