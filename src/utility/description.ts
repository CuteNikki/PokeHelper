import type { Client } from 'discord.js';

import { logger } from 'utility/logger';

/**
 * The bot's description on its profile and in the App Directory, kept here instead of only in the developer portal, so it's updated
 * along with the features. Put on the bot when it starts.
 */
export const DESCRIPTION_PATH = 'DESCRIPTION.txt';
/** The most characters Discord takes for an application's description. */
export const MAX_DESCRIPTION_LENGTH = 400;

/** The description, with the same line endings on Windows and Linux, as git checks it out with either. */
export const readDescription = async () => (await Bun.file(DESCRIPTION_PATH).text()).replace(/\r\n/g, '\n').trim();

/** Put the description on the bot, if it's not already the one it has, so restarting doesn't ask Discord each time. */
export async function syncDescription(client: Client<true>) {
  const description = await readDescription();
  const application = await client.application.fetch();
  if (application.description === description) return;
  await client.application.edit({ description });
  logger.info(`Updated the bot's description from ${DESCRIPTION_PATH}`);
}
