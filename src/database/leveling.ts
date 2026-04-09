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
  prisma.guildLeveling.update({
    where: { guildId },
    data: { ignoredChannels: { push: channelId } },
  });

export const addIgnoredRole = async (guildId: string, roleId: string) =>
  prisma.guildLeveling.update({
    where: { guildId },
    data: { ignoredRoles: { push: roleId } },
  });

export const addEnabledChannel = async (guildId: string, channelId: string) =>
  prisma.guildLeveling.update({
    where: { guildId },
    data: { enabledChannels: { push: channelId } },
  });

export const addEnabledRole = async (guildId: string, roleId: string) =>
  prisma.guildLeveling.update({
    where: { guildId },
    data: { enabledRoles: { push: roleId } },
  });

export const addGuildLevelingReward = async (guildId: string, level: number, roleId: string) =>
  prisma.guildLevelingReward.create({
    data: {
      guildId,
      level,
      roleId,
    },
  });

export const deleteGuildLevelingReward = async (id: string) =>
  prisma.guildLevelingReward.delete({
    where: { id },
  });

export const addXpToUser = async (guildId: string, userId: string, xpToAdd: number) =>
  prisma.userLeveling.upsert({
    where: { guildId_userId: { guildId, userId } },
    update: { xp: { increment: xpToAdd } },
    create: { guildId, userId, xp: xpToAdd },
  });

export const getUserLevelingData = async (guildId: string, userId: string) =>
  prisma.userLeveling.findUnique({
    where: { guildId_userId: { guildId, userId } },
  });

export const getTopUsersByXP = async (guildId: string, take: number = 10, skip: number = 0) =>
  prisma.userLeveling.findMany({
    where: { guildId },
    orderBy: { xp: 'desc' },
    take,
    skip,
  });

export const getUserRank = async (guildId: string, targetXp: number) => {
  const usersWithMoreXp = await prisma.userLeveling.count({
    where: {
      guildId,
      xp: {
        gt: targetXp,
      },
    },
  });

  return usersWithMoreXp + 1;
};

export const getTotalUsersWithXP = async (guildId: string) =>
  prisma.userLeveling.count({
    where: { guildId },
  });
