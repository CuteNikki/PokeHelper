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

export const addXpToUser = (guildId: string, userId: string, xpToAdd: number) =>
  prisma.level.upsert({
    where: { guildId_userId: { guildId, userId } },
    update: { xp: { increment: xpToAdd } },
    create: { guildId, userId, xp: xpToAdd },
  });

export const getUserLevelingData = (guildId: string, userId: string) =>
  prisma.level.findUnique({
    where: { guildId_userId: { guildId, userId } },
  });

export const getTopUsersByXP = (guildId: string, take: number = 10, skip: number = 0, sortOrder: 'asc' | 'desc' = 'desc') =>
  prisma.level.findMany({
    where: { guildId },
    orderBy: { xp: sortOrder },
    take,
    skip,
  });

export const getUserRank = async (guildId: string, targetXp: number) => {
  const usersWithMoreXp = await prisma.level.count({
    where: {
      guildId,
      xp: {
        gt: targetXp,
      },
    },
  });

  return usersWithMoreXp + 1;
};

export const getTotalUsersWithXP = (guildId: string) =>
  prisma.level.count({
    where: { guildId },
  });

export const getTotalWeeklyUsersWithXP = (guildId: string) =>
  prisma.weeklyLevel.count({
    where: { guildId },
  });

export const getTopWeeklyUsersByXP = (guildId: string, take: number = 10, skip: number = 0, sortOrder: 'asc' | 'desc' = 'desc') =>
  prisma.weeklyLevel.findMany({
    where: { guildId },
    orderBy: { xp: sortOrder },
    take,
    skip,
  });

export const addXpToUserWeekly = (guildId: string, userId: string, xpToAdd: number) =>
  prisma.weeklyLevel.upsert({
    where: { guildId_userId: { guildId, userId } },
    update: { xp: { increment: xpToAdd } },
    create: { guildId, userId, xp: xpToAdd },
  });

export const getWeeklyUserLevelingData = (guildId: string, userId: string) =>
  prisma.weeklyLevel.findUnique({
    where: { guildId_userId: { guildId, userId } },
  });

/**
 * Record a weekly reset and start the new week from zero.
 * @param winnerRole The role the winner got, or null if none was given.
 */
export const processWeeklyResetTransaction = (guildId: string, newWinnerId: string | null, winnerRole: string | null) =>
  prisma.$transaction([
    prisma.guildLeveling.update({
      where: { guildId },
      data: {
        weeklyLastWinner: newWinnerId,
        weeklyWinnerRole: winnerRole,
        weeklyLastResetAt: new Date(),
      },
    }),
    prisma.weeklyLevel.deleteMany({
      where: { guildId },
    }),
  ]);

export const getWeeklyUserRank = async (guildId: string, targetXp: number) => {
  const usersWithMoreXp = await prisma.weeklyLevel.count({
    where: {
      guildId,
      xp: {
        gt: targetXp,
      },
    },
  });

  return usersWithMoreXp + 1;
};

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
