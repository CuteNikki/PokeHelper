import type { Guild } from '@prisma/client';

import { prisma } from 'database/index';

/**
 * Get a guild by its ID.
 * @param guildId {string} The ID of the guild to retrieve.
 * @returns {Promise<Guild | null>} The guild object if found, otherwise null.
 */
export const getGuild = async (guildId: string): Promise<Guild | null> =>
  prisma.guild.findUnique({
    where: { guildId },
  });

/**
 * Create a new guild in the database.
 * @param guildId {string} The ID of the guild to create.
 * @returns {Promise<Guild>} The created guild object.
 * @throws {Error} If the guild could not be created.
 */
export const createGuild = async (guildId: string): Promise<Guild> =>
  prisma.guild.create({
    data: { guildId },
  });

/**
 * Get a guild by its ID, or create it if it doesn't exist.
 * @param guildId {string} The ID of the guild to retrieve or create.
 * @returns {Promise<Guild>} The guild object.
 */
export const getGuildOrCreate = async (guildId: string): Promise<Guild> =>
  await prisma.guild.upsert({
    where: { guildId },
    update: {},
    create: { guildId },
  });
