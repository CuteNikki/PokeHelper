import { Events } from 'discord.js';

import { Event } from 'classes/base/event';

import { logger } from 'utility/logger';
import { syncStatBarEmojis } from 'utility/statBarEmojis';

/** Makes sure the bot has the emojis stat bars are made of. Until then, or if it fails, the bars use plain emoji. */
export default new Event({
  name: Events.ClientReady,
  once: true,
  async execute(_, client) {
    await syncStatBarEmojis(client).catch((error: unknown) => logger.error(error, 'Failed to set up the stat bar emojis'));
  },
});
