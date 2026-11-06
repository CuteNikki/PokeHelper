import { prisma } from 'database/index';
import { getUserData } from 'database/user';

import type { GuildBirthday, UserBirthday } from 'generated/prisma/client';

export const getGuildBirthdayConfiguration = async (guildId: string) =>
  prisma.guildBirthday.findUnique({
    where: { guildId },
  });

/**
 * Get a guild's birthday configuration, creating the default one, which has birthdays turned off, if there's none yet.
 * @param guildId {string} The ID of the guild.
 */
export const getOrCreateGuildBirthdayConfiguration = async (guildId: string) =>
  prisma.guildBirthday.upsert({
    where: { guildId },
    update: {},
    create: { guildId },
  });

export const updateGuildBirthdayConfiguration = async (guildId: string, query: Partial<Omit<GuildBirthday, 'guildId'>>) =>
  prisma.guildBirthday.update({
    where: { guildId },
    data: query,
  });

// Nothing to delete, like when reset twice, is fine
export const deleteGuildBirthdayConfiguration = async (guildId: string) => prisma.guildBirthday.deleteMany({ where: { guildId } });

export const getUserBirthday = async (userId: string) =>
  prisma.userBirthday.findUnique({
    where: { userId },
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

/** Set someone's birthday, which also sets it up with the defaults if it's their first. */
export async function setUserBirthdayDate(userId: string, date: Date) {
  // A birthday belongs to a user, who may not be saved yet
  await getUserData(userId);
  return prisma.userBirthday.upsert({ where: { userId }, create: { userId, date, showAge: false, announceInGuildsByDefault: true }, update: { date } });
}
