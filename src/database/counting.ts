import type { GuildCounting } from '@prisma/client';

import { prisma } from 'database/index';

/**
 * Get the counting configuration for a guild.
 * @param guildId {string} The ID of the guild to retrieve the counting configuration for.
 */
export const getCounting = async (guildId: string) =>
  prisma.guildCounting.findUnique({
    where: { guildId },
  });

/**
 * Create a new counting configuration for a guild.
 * @param guildId {string} The ID of the guild to create the counting configuration for.
 * @param channelId {string} The ID of the channel where counting will take place.
 * @param resetOnFail {boolean} Whether to reset the count if the counting fails. Defaults to false.
 */
export const createCounting = async (guildId: string, channelId: string, resetOnFail: boolean = false) =>
  prisma.guildCounting.create({
    data: { guildId, channelId, resetOnFail },
  });

/**
 * Update the counting configuration for a guild.
 * @param guildId {string} The ID of the guild to update the counting configuration for.
 * @param query {Partial<Omit<Counting, 'guildId'>>} The fields to update in the counting configuration.
 */
export const updateCounting = async (guildId: string, query: Partial<Omit<GuildCounting, 'guildId'>>) =>
  prisma.guildCounting.update({
    where: { guildId },
    data: query,
  });

/**
 * Reset the counting configuration for a guild.
 * @param guildId {string} The ID of the guild to reset the counting configuration for.
 */
export const resetCounting = async (guildId: string) =>
  prisma.guildCounting.delete({
    where: { guildId },
  });

/**
 * Reset the current counting number for a guild without deleting the configuration.
 * @param guildId {string} The ID of the guild to reset the current counting number for.
 */
export const resetCountingCount = async (guildId: string) =>
  prisma.guildCounting.update({
    where: { guildId },
    data: { lastNumber: 0, lastNumberAt: null, lastNumberByUserId: null, lastNumberMessageId: null },
  });

/**
 * Increment the current counting number for a guild.
 * @param guildId {string} The ID of the guild to increment the counting number for.
 * @param userId {string} The ID of the user who is incrementing the count.
 * @param messageId {string} The ID of the message that triggered the increment.
 */
export const incrementCountingCount = async (guildId: string, userId: string, messageId: string) => {
  const currentCounting = await getCounting(guildId);

  if (!currentCounting) {
    throw new Error(`Counting configuration not found for guild ID: ${guildId}`);
  }

  const newCount = currentCounting.lastNumber + 1;
  const highestNumber = currentCounting.highestNumber || 0;
  const isHigherNumber = newCount > highestNumber;
  const now = new Date();

  return await prisma.guildCounting.update({
    where: { guildId },
    data: {
      lastNumber: newCount,
      lastNumberAt: now,
      lastNumberByUserId: userId,
      lastNumberMessageId: messageId,
      // Update highest number if the new count is higher
      highestNumber: Math.max(highestNumber, newCount),
      highestNumberAt: isHigherNumber ? now : currentCounting.highestNumberAt,
      highestNumberByUserId: isHigherNumber ? userId : currentCounting.highestNumberByUserId,
      highestNumberMessageId: isHigherNumber ? messageId : currentCounting.highestNumberMessageId,
    },
  });
};
