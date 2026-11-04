import type { BotProfile } from 'generated/prisma/client';

import { prisma } from 'database/index';

/** The bot's profile is a single row, with this id. */
const ID = 1;

/** Which theme the bot's avatar and banner wear, and the one picked by hand if there is one. */
export const getBotProfile = async () => prisma.botProfile.findUnique({ where: { id: ID } });

/** Change what's known about the bot's profile, adding the row first if it isn't there yet. */
export const updateBotProfile = async (data: Partial<Pick<BotProfile, 'avatarTheme' | 'bannerTheme' | 'override'>>) =>
  prisma.botProfile.upsert({ where: { id: ID }, update: data, create: { id: ID, ...data } });
