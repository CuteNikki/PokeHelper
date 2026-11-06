import { Events } from 'discord.js';

import { Event } from 'classes/base/event';

import { syncDescription } from 'utility/description';
import { logger } from 'utility/logger';

/** Keeps the bot's description the one in the repository, so it doesn't fall behind the features. */
export default new Event({
  name: Events.ClientReady,
  once: true,
  async execute(_, client) {
    await syncDescription(client).catch((error: unknown) => logger.error(error, "Failed to update the bot's description"));
  },
});
