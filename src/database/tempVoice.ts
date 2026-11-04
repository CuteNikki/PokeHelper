import { prisma } from 'database/index';

import type { TempVoiceChannel, TempVoiceCreator, TempVoiceSettings } from 'generated/prisma/client';

export type { TempVoiceChannel, TempVoiceCreator, TempVoiceSettings };

// Join-to-create channels

export const getTempVoiceCreator = async (id: string) => prisma.tempVoiceCreator.findUnique({ where: { id } });

export const getTempVoiceCreatorByChannel = async (channelId: string) => prisma.tempVoiceCreator.findUnique({ where: { channelId } });

export const getTempVoiceCreators = async (guildId: string) => prisma.tempVoiceCreator.findMany({ where: { guildId }, orderBy: { createdAt: 'asc' } });

/** Every join-to-create channel, for catching up on start. */
export const getAllTempVoiceCreators = async () => prisma.tempVoiceCreator.findMany();

export const countTempVoiceCreators = async (guildId: string) => prisma.tempVoiceCreator.count({ where: { guildId } });

/** Make a channel a join-to-create channel. The server is added to the database first, if it isn't in it yet. */
export async function createTempVoiceCreator(guildId: string, channelId: string) {
  await prisma.guild.upsert({ where: { guildId }, update: {}, create: { guildId } });
  return prisma.tempVoiceCreator.create({ data: { guildId, channelId } });
}

export const updateTempVoiceCreator = async (id: string, data: Partial<Pick<TempVoiceCreator, 'channelId' | 'categoryId' | 'namePrefix' | 'enabled'>>) =>
  prisma.tempVoiceCreator.update({ where: { id }, data });

/** Stop a channel being a join-to-create channel. The channels made with it stay until they're empty. */
export const deleteTempVoiceCreator = async (id: string) => prisma.tempVoiceCreator.deleteMany({ where: { id } });

/** Forget a join-to-create channel that was deleted. */
export const deleteTempVoiceCreatorByChannel = async (channelId: string) => prisma.tempVoiceCreator.deleteMany({ where: { channelId } });

// Channels people got

export const getTempVoiceChannel = async (channelId: string) => prisma.tempVoiceChannel.findUnique({ where: { channelId } });

/** Every temporary channel, for catching up on start. */
export const getAllTempVoiceChannels = async () => prisma.tempVoiceChannel.findMany({ select: { channelId: true, guildId: true } });

/** Which of these channels are temporary channels. */
export const findTempVoiceChannelIds = async (channelIds: string[]) =>
  new Set((await prisma.tempVoiceChannel.findMany({ where: { channelId: { in: channelIds } }, select: { channelId: true } })).map((row) => row.channelId));

export const getOwnedTempVoiceChannels = async (guildId: string, ownerId: string) => prisma.tempVoiceChannel.findMany({ where: { guildId, ownerId } });

export const createTempVoiceChannel = async (
  data: Pick<TempVoiceChannel, 'channelId' | 'guildId' | 'creatorId' | 'ownerId' | 'namePrefix' | 'locked' | 'hidden' | 'allowed' | 'blocked'>,
) => prisma.tempVoiceChannel.create({ data });

export const updateTempVoiceChannel = async (
  channelId: string,
  data: Partial<Pick<TempVoiceChannel, 'ownerId' | 'panelMessageId' | 'locked' | 'hidden' | 'allowed' | 'blocked'>>,
) => prisma.tempVoiceChannel.update({ where: { channelId }, data });

export const deleteTempVoiceChannel = async (channelId: string) => prisma.tempVoiceChannel.deleteMany({ where: { channelId } });

// How people left their last channel

export const getTempVoiceSettings = async (guildId: string, userId: string) =>
  prisma.tempVoiceSettings.findUnique({ where: { guildId_userId: { guildId, userId } } });

export const saveTempVoiceSettings = async (guildId: string, userId: string, data: Omit<TempVoiceSettings, 'guildId' | 'userId' | 'updatedAt'>) =>
  prisma.tempVoiceSettings.upsert({ where: { guildId_userId: { guildId, userId } }, create: { guildId, userId, ...data }, update: data });
