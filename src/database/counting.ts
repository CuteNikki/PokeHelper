import type { GuildCounting } from '@prisma/client';

import { prisma } from 'database/index';

/**
 * Get the counting configuration for a guild.
 * @param guildId {string} The ID of the guild to retrieve the counting configuration for.
 * @returns {Promise<Counting | null>} The counting configuration if found, otherwise null.
 */
export const getCounting = async (guildId: string): Promise<GuildCounting | null> =>
  prisma.guildCounting.findUnique({
    where: { guildId },
  });

/**
 * Create a new counting configuration for a guild.
 * @param guildId {string} The ID of the guild to create the counting configuration for.
 * @param channelId {string} The ID of the channel where counting will take place.
 * @param resetOnFail {boolean} Whether to reset the count if the counting fails. Defaults to false.
 * @returns {Promise<Counting>} The created counting configuration.
 * @throws {Error} If the counting configuration could not be created.
 */
export const createCounting = async (guildId: string, channelId: string, resetOnFail: boolean = false): Promise<GuildCounting> =>
  prisma.guildCounting.create({
    data: { guildId, channelId, resetOnFail },
  });

/**
 * Update the counting configuration for a guild.
 * @param guildId {string} The ID of the guild to update the counting configuration for.
 * @param query {Partial<Omit<Counting, 'guildId'>>} The fields to update in the counting configuration.
 * @returns {Promise<Counting>} The updated counting configuration.
 * @throws {Error} If the counting configuration could not be updated.
 */
export const updateCounting = async (guildId: string, query: Partial<Omit<GuildCounting, 'guildId'>>): Promise<GuildCounting> =>
  prisma.guildCounting.update({
    where: { guildId },
    data: query,
  });

/**
 * Reset the counting configuration for a guild.
 * @param guildId {string} The ID of the guild to reset the counting configuration for.
 * @returns {Promise<Counting>} The updated counting configuration with current count reset.
 * @throws {Error} If the counting configuration could not be reset.
 */
export const resetCounting = async (guildId: string): Promise<GuildCounting> =>
  prisma.guildCounting.delete({
    where: { guildId },
  });

/**
 * Reset the current counting number for a guild without deleting the configuration.
 * @param guildId {string} The ID of the guild to reset the current counting number for.
 * @returns {Promise<Counting>} The updated counting configuration with current number reset.
 * @throws {Error} If the counting configuration could not be updated.
 */
export const resetCountingCount = async (guildId: string): Promise<GuildCounting> =>
  prisma.guildCounting.update({
    where: { guildId },
    data: { lastNumber: 0, lastNumberAt: null, lastNumberByUserId: null, lastNumberMessageId: null },
  });

/**
 * Increment the current counting number for a guild.
 * @param guildId {string} The ID of the guild to increment the counting number for.
 * @param userId {string} The ID of the user who is incrementing the count.
 * @param messageId {string} The ID of the message that triggered the increment.
 * @returns {Promise<Counting>} The updated counting configuration with the incremented count.
 * @throws {Error} If the counting configuration could not be updated or if it does not exist.
 */
export const incrementCountingCount = async (guildId: string, userId: string, messageId: string): Promise<GuildCounting> => {
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
