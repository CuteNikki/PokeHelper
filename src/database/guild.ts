import { prisma } from 'database/index';

/**
 * Get a guild by its ID.
 * @param guildId {string} The ID of the guild to retrieve.
 */
export const getGuild = async (guildId: string) =>
  prisma.guild.findUnique({
    where: { guildId },
  });

/**
 * Create a new guild in the database.
 * @param guildId {string} The ID of the guild to create.
 */
export const createGuild = async (guildId: string) =>
  prisma.guild.create({
    data: { guildId },
  });

/**
 * Get a guild by its ID, or create it if it doesn't exist.
 * @param guildId {string} The ID of the guild to retrieve or create.
 */
export const getGuildOrCreate = async (guildId: string) =>
  await prisma.guild.upsert({
    where: { guildId },
    update: {},
    create: { guildId },
  });
