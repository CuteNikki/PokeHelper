import { Events } from 'discord.js';

import { Event } from 'classes/base/event';

import { logger } from 'utility/logger';
import { syncBotEmojis } from 'utility/emojis';

/** Makes sure the bot has its own emojis, for stat bars and types. Until then, or if it fails, the text does without them. */
export default new Event({
  name: Events.ClientReady,
  once: true,
  async execute(_, client) {
    await syncBotEmojis(client).catch((error: unknown) => logger.error(error, "Failed to set up the bot's emojis"));
  },
});
