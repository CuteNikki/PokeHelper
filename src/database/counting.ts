import { prisma } from 'database/index';

import type { GuildCounting } from 'generated/prisma/client';
import type { CountingState } from 'utility/counting';

/**
 * Get the counting configuration for a guild.
 * @param guildId {string} The ID of the guild to retrieve the counting configuration for.
 */
export const getCounting = async (guildId: string) =>
  prisma.guildCounting.findUnique({
    where: { guildId },
  });

/**
 * Get the counting configurations of all guilds.
 */
export const getAllCountings = async () => prisma.guildCounting.findMany();

/**
 * Create a new counting configuration for a guild.
 * @param guildId {string} The ID of the guild to create the counting configuration for.
 * @param data.channelId {string} The ID of the channel where counting will take place.
 * @param data.resetOnFail {boolean} Whether to reset the count if the counting fails.
 * @param data.allowMath {boolean} Whether numbers can be sent as math expressions.
 * @param data.lastCheckedMessageId {string} The message ID to start checking after, so older messages in the channel are left alone.
 */
export const createCounting = async (guildId: string, data: Pick<GuildCounting, 'channelId' | 'resetOnFail' | 'allowMath' | 'lastCheckedMessageId'>) =>
  prisma.guildCounting.create({
    data: { guildId, ...data },
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
 * Save the counting state, but only if no other message was checked since it was read.
 * @param guildId {string} The ID of the guild to save the counting state for.
 * @param previousCheckedMessageId {string | null} The last checked message ID when the state was read.
 * @param state {CountingState} The new counting state.
 * @returns {Promise<boolean>} Whether the state was saved. False means it changed in between and the message should be checked again.
 */
export const saveCountingState = async (guildId: string, previousCheckedMessageId: string | null, state: CountingState) => {
  const { count } = await prisma.guildCounting.updateMany({
    where: { guildId, lastCheckedMessageId: previousCheckedMessageId },
    data: state,
  });
  return count > 0;
};
