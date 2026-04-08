import { prisma } from 'database/index';

import type { GuildBirthday, UserBirthday } from 'generated/prisma/client';

export const getGuildBirthdayConfiguration = async (guildId: string) =>
  prisma.guildBirthday.findUnique({
    where: { guildId },
  });

export const createGuildBirthdayConfiguration = async (guildId: string, channelId: string, roleId?: string) =>
  prisma.guildBirthday.create({
    data: { guildId, channelId, roleId },
  });

export const updateGuildBirthdayConfiguration = async (guildId: string, query: Partial<Omit<GuildBirthday, 'guildId'>>) =>
  prisma.guildBirthday.update({
    where: { guildId },
    data: query,
  });

export const deleteGuildBirthdayConfiguration = async (guildId: string) =>
  prisma.guildBirthday.delete({
    where: { guildId },
  });

export const getUserBirthday = async (userId: string) =>
  prisma.userBirthday.findUnique({
    where: { userId },
  });

export const createUserBirthday = async (userId: string, date: Date, timezone: string, showAge: boolean = false, announceInGuildsByDefault: boolean = true) =>
  prisma.userBirthday.create({
    data: { userId, date, timezone, showAge, announceInGuildsByDefault },
  });

export const updateUserBirthday = async (userId: string, query: Partial<Omit<UserBirthday, 'userId'>>) =>
  prisma.userBirthday.update({
    where: { userId },
    data: query,
  });

export const deleteUserBirthday = async (userId: string) =>
  prisma.userBirthday.delete({
    where: { userId },
  });
