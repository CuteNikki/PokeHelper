import { prisma } from 'database/index';

import type { GuildLeveling } from 'generated/prisma/client';

export const getLevelFromXP = (xp: number) => Math.floor(0.1 * Math.sqrt(xp));
export const getXPForLevel = (level: number) => Math.pow(level / 0.1, 2);

export const getGuildLevelingConfiguration = async (guildId: string) =>
  prisma.guildLeveling.findUnique({
    where: { guildId },
    include: { rewards: true },
  });

export const createGuildLevelingConfiguration = async (guildId: string) =>
  prisma.guildLeveling.create({
    data: { guildId },
    include: { rewards: true },
  });

export const updateGuildLevelingConfiguration = async (guildId: string, query: Partial<Omit<GuildLeveling, 'guildId'>>) =>
  prisma.guildLeveling.upsert({
    where: { guildId },
    update: query,
    create: { guildId, ...query },
    include: { rewards: true },
  });

export const deleteGuildLevelingConfiguration = async (guildId: string) =>
  prisma.guildLeveling.delete({
    where: { guildId },
    include: { rewards: true },
  });

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
    include: { rewards: true },
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

export const processWeeklyResetTransaction = (guildId: string, newWinnerId: string | null) =>
  prisma.$transaction([
    prisma.guildLeveling.update({
      where: { guildId },
      data: {
        weeklyLastWinner: newWinnerId,
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
